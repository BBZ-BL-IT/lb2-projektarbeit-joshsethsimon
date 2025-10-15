const express = require('express');
const amqp = require('amqplib');
const { Tail } = require('tail');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8005;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const LOG_FILE = '/var/log/turnserver.log';

app.use(cors());
app.use(express.json());

let channel = null;
let rabbitConnection = null;

// Statistics
const stats = {
  totalConnections: 0,
  activeConnections: 0,
  totalAllocations: 0,
  activeAllocations: 0,
  totalBytes: 0,
  stunRequests: 0,
  turnRequests: 0,
  errors: 0,
  startTime: new Date()
};

// Store active sessions
const activeSessions = new Map();

// Connect to RabbitMQ
async function connectRabbitMQ() {
  try {
    rabbitConnection = await amqp.connect(RABBITMQ_URL);
    channel = await rabbitConnection.createChannel();
    
    // Assert queues
    await channel.assertQueue('logs', { durable: true });
    await channel.assertQueue('webrtc_events', { durable: true });
    
    console.log('Connected to RabbitMQ');

    // Handle connection events
    rabbitConnection.on('close', () => {
      console.error('RabbitMQ connection closed. Attempting to reconnect...');
      setTimeout(connectRabbitMQ, 5000);
    });

    rabbitConnection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
    });

  } catch (err) {
    console.error('Failed to connect to RabbitMQ:', err);
    setTimeout(connectRabbitMQ, 5000);
  }
}

// Log event to RabbitMQ
async function logEvent(eventType, details = {}) {
  const event = {
    eventType,
    service: 'stun-turn-service',
    details,
    timestamp: new Date()
  };

  try {
    if (channel) {
      // Send to webrtc_events queue
      await channel.sendToQueue(
        'webrtc_events',
        Buffer.from(JSON.stringify(event)),
        { persistent: true }
      );

      // Also send to logs queue
      await channel.sendToQueue(
        'logs',
        Buffer.from(JSON.stringify({
          action: eventType,
          username: 'webrtc-system',
          details: details,
          timestamp: new Date()
        })),
        { persistent: true }
      );
    }
  } catch (error) {
    console.error('Error logging event to RabbitMQ:', error);
  }
}

// Parse TURN server log entries
function parseLogEntry(line) {
  try {
    // Example log patterns from coturn:
    // session 001000000000000001: new, username <username>, realm <realm>, origin <ip:port>
    // session 001000000000000001: allocation created
    // session 001000000000000001: closed (2nd stage), user <username> realm <realm> origin <ip:port>
    
    if (line.includes('session') && line.includes('new')) {
      const sessionMatch = line.match(/session\s+(\w+)/);
      const usernameMatch = line.match(/username\s+<([^>]+)>/);
      const ipMatch = line.match(/origin\s+<([^>]+)>/);
      
      if (sessionMatch) {
        const sessionId = sessionMatch[1];
        const username = usernameMatch ? usernameMatch[1] : 'unknown';
        const origin = ipMatch ? ipMatch[1] : 'unknown';
        
        stats.totalConnections++;
        stats.activeConnections++;
        
        activeSessions.set(sessionId, {
          username,
          origin,
          startTime: new Date()
        });
        
        logEvent('connection_established', {
          sessionId,
          username,
          origin
        });
      }
    }
    
    if (line.includes('allocation created')) {
      const sessionMatch = line.match(/session\s+(\w+)/);
      if (sessionMatch) {
        const sessionId = sessionMatch[1];
        stats.totalAllocations++;
        stats.activeAllocations++;
        stats.turnRequests++;
        
        logEvent('turn_allocation_created', {
          sessionId,
          session: activeSessions.get(sessionId)
        });
      }
    }
    
    if (line.includes('closed') || line.includes('deleted')) {
      const sessionMatch = line.match(/session\s+(\w+)/);
      if (sessionMatch) {
        const sessionId = sessionMatch[1];
        const session = activeSessions.get(sessionId);
        
        if (session) {
          const duration = Date.now() - session.startTime.getTime();
          stats.activeConnections = Math.max(0, stats.activeConnections - 1);
          stats.activeAllocations = Math.max(0, stats.activeAllocations - 1);
          
          logEvent('connection_closed', {
            sessionId,
            username: session.username,
            origin: session.origin,
            duration: duration
          });
          
          activeSessions.delete(sessionId);
        }
      }
    }
    
    if (line.includes('STUN') && !line.includes('TURN')) {
      stats.stunRequests++;
    }
    
    if (line.toLowerCase().includes('error')) {
      stats.errors++;
      logEvent('turn_error', { message: line });
    }

    // Parse data transfer info
    const bytesMatch = line.match(/(\d+)\s+bytes/);
    if (bytesMatch) {
      stats.totalBytes += parseInt(bytesMatch[1]);
    }

  } catch (error) {
    console.error('Error parsing log entry:', error);
  }
}

// Monitor TURN server logs
function monitorLogs() {
  // Check if log file exists, create if not
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '');
  }

  const tail = new Tail(LOG_FILE, {
    follow: true,
    useWatchFile: true
  });

  tail.on('line', (line) => {
    console.log('TURN Log:', line);
    parseLogEntry(line);
  });

  tail.on('error', (error) => {
    console.error('Error tailing log file:', error);
  });

  console.log(`Monitoring TURN server logs at ${LOG_FILE}`);
}

// Health check endpoint
app.get('/health', async (req, res) => {
  const rabbitMQStatus = channel ? 'UP' : 'DOWN';
  
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'stun-turn-service',
    dependencies: {
      rabbitmq: rabbitMQStatus
    },
    turnServer: {
      active: true,
      stunPort: 3478,
      turnPort: 3478,
      tlsPort: 5349
    }
  });
});

// Get STUN/TURN server statistics
app.get('/api/turn/stats', (req, res) => {
  res.json({
    ...stats,
    uptime: Date.now() - stats.startTime.getTime(),
    activeSessions: activeSessions.size,
    timestamp: new Date().toISOString()
  });
});

// Get active sessions
app.get('/api/turn/sessions', (req, res) => {
  const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
    sessionId: id,
    ...session,
    duration: Date.now() - session.startTime.getTime()
  }));

  res.json({
    sessions,
    count: sessions.length,
    timestamp: new Date().toISOString()
  });
});

// Get TURN server configuration info
app.get('/api/turn/config', (req, res) => {
  res.json({
    stunServer: `stun:${process.env.TURN_SERVER_HOST || 'localhost'}:3478`,
    turnServer: {
      urls: [
        `turn:${process.env.TURN_SERVER_HOST || 'localhost'}:3478`,
        `turn:${process.env.TURN_SERVER_HOST || 'localhost'}:3478?transport=tcp`
      ],
      username: 'turnuser',
      credential: 'turnpassword'
    },
    iceServers: [
      { urls: `stun:${process.env.TURN_SERVER_HOST || 'localhost'}:3478` },
      {
        urls: [
          `turn:${process.env.TURN_SERVER_HOST || 'localhost'}:3478`,
          `turn:${process.env.TURN_SERVER_HOST || 'localhost'}:3478?transport=tcp`
        ],
        username: 'turnuser',
        credential: 'turnpassword'
      }
    ]
  });
});

// Test endpoint to trigger a log event
app.post('/api/turn/test-event', async (req, res) => {
  const { eventType, details } = req.body;
  
  await logEvent(eventType || 'test_event', details || { test: true });
  
  res.json({
    message: 'Test event logged',
    eventType: eventType || 'test_event',
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Start the service
async function startService() {
  await connectRabbitMQ();
  
  // Start monitoring logs after a short delay to ensure TURN server is running
  setTimeout(monitorLogs, 2000);
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`STUN/TURN monitoring service running on port ${PORT}`);
    logEvent('service_started', { port: PORT });
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  
  if (rabbitConnection) {
    await rabbitConnection.close();
  }
  
  process.exit(0);
});

startService();
