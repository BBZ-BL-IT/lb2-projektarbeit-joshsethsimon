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
const TURN_SERVER_HOST = process.env.TURN_SERVER_HOST || 'localhost';
const TURN_USERNAME = process.env.TURN_USERNAME || 'turnuser';
const TURN_PASSWORD = process.env.TURN_PASSWORD || 'turnpassword';

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

      // Also send to logs queue with correct schema
      await channel.sendToQueue(
        'logs',
        Buffer.from(JSON.stringify({
          action: eventType,
          username: 'webrtc-system',
          details: details,
          timestamp: new Date(),
          service: 'stun-turn-service',
          category: 'webrtc'
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
    
    // New STUN binding request
    if (line.includes('STUN') && (line.includes('binding') || line.includes('request'))) {
      const ipMatch = line.match(/from\s+([0-9.]+):(\d+)/);
      stats.stunRequests++;
      
      logEvent('stun_binding_request', {
        clientIp: ipMatch ? ipMatch[1] : 'unknown',
        clientPort: ipMatch ? ipMatch[2] : 'unknown',
        logLine: line.substring(0, 200)
      });
    }
    
    if (line.includes('session') && line.includes('new')) {
      const sessionMatch = line.match(/session\s+(\w+)/);
      const usernameMatch = line.match(/username\s+<([^>]+)>/);
      const ipMatch = line.match(/origin\s+<([^>]+)>/);
      const realmMatch = line.match(/realm\s+<([^>]+)>/);
      
      if (sessionMatch) {
        const sessionId = sessionMatch[1];
        const username = usernameMatch ? usernameMatch[1] : 'unknown';
        const origin = ipMatch ? ipMatch[1] : 'unknown';
        const realm = realmMatch ? realmMatch[1] : 'unknown';
        
        stats.totalConnections++;
        stats.activeConnections++;
        
        activeSessions.set(sessionId, {
          username,
          origin,
          realm,
          startTime: new Date()
        });
        
        logEvent('connection_established', {
          sessionId,
          username,
          origin,
          realm,
          timestamp: new Date().toISOString()
        });
        
        console.log(`[TURN] New connection - Session: ${sessionId}, User: ${username}, Origin: ${origin}`);
      }
    }
    
    if (line.includes('allocation created')) {
      const sessionMatch = line.match(/session\s+(\w+)/);
      const ipMatch = line.match(/relayed\s+([0-9.]+):(\d+)/);
      
      if (sessionMatch) {
        const sessionId = sessionMatch[1];
        const session = activeSessions.get(sessionId);
        
        stats.totalAllocations++;
        stats.activeAllocations++;
        stats.turnRequests++;
        
        logEvent('turn_allocation_created', {
          sessionId,
          username: session?.username || 'unknown',
          origin: session?.origin || 'unknown',
          relayedIp: ipMatch ? ipMatch[1] : 'unknown',
          relayedPort: ipMatch ? ipMatch[2] : 'unknown',
          timestamp: new Date().toISOString()
        });
        
        console.log(`[TURN] Allocation created - Session: ${sessionId}, User: ${session?.username || 'unknown'}`);
      }
    }
    
    // Channel binding
    if (line.includes('channel') && line.includes('bind')) {
      const sessionMatch = line.match(/session\s+(\w+)/);
      const channelMatch = line.match(/channel\s+(\d+)/);
      
      if (sessionMatch) {
        logEvent('turn_channel_bind', {
          sessionId: sessionMatch[1],
          channel: channelMatch ? channelMatch[1] : 'unknown'
        });
      }
    }
    
    // Permission created
    if (line.includes('permission') && line.includes('created')) {
      const sessionMatch = line.match(/session\s+(\w+)/);
      const ipMatch = line.match(/for\s+([0-9.]+)/);
      
      if (sessionMatch) {
        logEvent('turn_permission_created', {
          sessionId: sessionMatch[1],
          peerIp: ipMatch ? ipMatch[1] : 'unknown'
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
            durationMs: duration,
            durationSec: Math.round(duration / 1000),
            timestamp: new Date().toISOString()
          });
          
          console.log(`[TURN] Connection closed - Session: ${sessionId}, User: ${session.username}, Duration: ${Math.round(duration/1000)}s`);
          
          activeSessions.delete(sessionId);
        }
      }
    }
    
    if (line.toLowerCase().includes('error')) {
      stats.errors++;
      
      // Extract error details
      const errorMatch = line.match(/error\s+(\d+)/i);
      const errorCode = errorMatch ? errorMatch[1] : 'unknown';
      
      logEvent('turn_error', { 
        errorCode,
        message: line.substring(0, 200),
        timestamp: new Date().toISOString()
      });
      
      console.error(`[TURN] Error: ${line.substring(0, 100)}`);
    }

    // Parse data transfer info
    const bytesMatch = line.match(/(\d+)\s+bytes/);
    if (bytesMatch) {
      const bytes = parseInt(bytesMatch[1]);
      stats.totalBytes += bytes;
      
      // Log significant data transfers (> 1MB)
      if (bytes > 1048576) {
        logEvent('data_transfer', {
          bytes,
          sizeMB: (bytes / 1048576).toFixed(2)
        });
      }
    }
    
    // Refresh request/response
    if (line.includes('refresh')) {
      const sessionMatch = line.match(/session\s+(\w+)/);
      if (sessionMatch) {
        logEvent('turn_refresh', {
          sessionId: sessionMatch[1]
        });
      }
    }

  } catch (error) {
    console.error('Error parsing log entry:', error);
  }
}

// Monitor TURN server logs
function monitorLogs() {
  // Check if log file exists, create if not
  if (!fs.existsSync(LOG_FILE)) {
    console.log(`Creating log file: ${LOG_FILE}`);
    fs.writeFileSync(LOG_FILE, '');
  }

  const tail = new Tail(LOG_FILE, {
    follow: true,
    useWatchFile: true
  });

  tail.on('line', (line) => {
    // Log all TURN server output
    console.log(`[TURN Server] ${line}`);
    parseLogEntry(line);
  });

  tail.on('error', (error) => {
    console.error('[TURN Monitor] Error tailing log file:', error);
  });

  console.log(`[TURN Monitor] Monitoring TURN server logs at ${LOG_FILE}`);
  
  // Log initial event
  logEvent('service_started', {
    logFile: LOG_FILE,
    timestamp: new Date().toISOString()
  });
}

// Health check endpoint
app.get('/health', async (req, res) => {
  const rabbitMQStatus = channel ? 'UP' : 'DOWN';
  
  // Check if turnserver process is running
  let turnServerStatus = 'DOWN';
  try {
    const { execSync } = require('child_process');
    execSync('pgrep -x turnserver', { stdio: 'ignore' });
    turnServerStatus = 'UP';
  } catch (error) {
    // pgrep returns non-zero if process not found
    turnServerStatus = 'DOWN';
  }
  
  const isHealthy = rabbitMQStatus === 'UP' && turnServerStatus === 'UP';
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    service: 'stun-turn-service',
    dependencies: {
      rabbitmq: rabbitMQStatus,
      turnserver: turnServerStatus
    },
    turnServer: {
      active: turnServerStatus === 'UP',
      stunPort: 3478,
      turnPort: 3478,
      tlsPort: 5349,
      relayPortRange: '49152-49200'
    },
    config: {
      host: TURN_SERVER_HOST,
      username: TURN_USERNAME,
      hasPassword: !!TURN_PASSWORD
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
  const config = {
    stunServer: `stun:${TURN_SERVER_HOST}:3478`,
    turnServer: {
      urls: [
        `turn:${TURN_SERVER_HOST}:3478`,
        `turn:${TURN_SERVER_HOST}:3478?transport=tcp`,
        `turn:${TURN_SERVER_HOST}:3478?transport=udp`
      ],
      username: TURN_USERNAME,
      credential: TURN_PASSWORD
    },
    iceServers: [
      { 
        urls: `stun:${TURN_SERVER_HOST}:3478` 
      },
      {
        urls: [
          `turn:${TURN_SERVER_HOST}:3478`,
          `turn:${TURN_SERVER_HOST}:3478?transport=tcp`,
          `turn:${TURN_SERVER_HOST}:3478?transport=udp`
        ],
        username: TURN_USERNAME,
        credential: TURN_PASSWORD
      }
    ]
  };
  
  console.log('TURN config requested:', {
    host: TURN_SERVER_HOST,
    username: TURN_USERNAME,
    hasPassword: !!TURN_PASSWORD
  });
  
  res.json(config);
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

// Diagnostic endpoint to test TURN connectivity
app.get('/api/turn/diagnostic', (req, res) => {
  res.json({
    message: 'TURN Server Diagnostic Information',
    timestamp: new Date().toISOString(),
    
    configuration: {
      host: TURN_SERVER_HOST,
      username: TURN_USERNAME,
      stunPort: 3478,
      turnPort: 3478,
      tlsPort: 5349,
      relayPortRange: '49152-49200'
    },
    
    testInstructions: {
      browser: {
        description: 'Test WebRTC connectivity from browser console',
        code: `
// Copy and paste this in browser console
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:${TURN_SERVER_HOST}:3478' },
    { 
      urls: 'turn:${TURN_SERVER_HOST}:3478',
      username: '${TURN_USERNAME}',
      credential: '${TURN_PASSWORD}'
    }
  ]
});

pc.createDataChannel('test');
pc.onicecandidate = (e) => {
  if (e.candidate) {
    console.log('ICE Candidate:', e.candidate.type, e.candidate.address || e.candidate.ip);
  } else {
    console.log('ICE gathering complete');
  }
};

pc.createOffer().then(offer => pc.setLocalDescription(offer));

// Wait for ICE gathering, then check:
setTimeout(() => {
  pc.getStats().then(stats => {
    let hasRelay = false;
    stats.forEach(stat => {
      if (stat.type === 'local-candidate' && stat.candidateType === 'relay') {
        hasRelay = true;
        console.log('✓ TURN relay candidate found:', stat);
      }
    });
    if (!hasRelay) {
      console.error('✗ No TURN relay candidates - TURN server not working!');
    }
  });
}, 5000);
`.trim()
      },
      
      curl: {
        description: 'Test TURN config endpoint',
        command: `curl http://localhost:8005/api/turn/config`
      },
      
      docker: {
        description: 'Check TURN server logs',
        command: 'docker logs stun-turn-service'
      }
    },
    
    commonIssues: [
      {
        issue: 'No relay candidates',
        causes: [
          'TURN server not running',
          'Wrong credentials',
          'Firewall blocking ports',
          'Missing EXTERNAL_IP in production'
        ],
        solution: 'Check docker logs and verify configuration'
      },
      {
        issue: 'Connection failed',
        causes: [
          'Both peers behind symmetric NAT',
          'Port range too limited',
          'TURN server not accessible from client'
        ],
        solution: 'Set EXTERNAL_IP and ensure ports 3478, 49152-49200 are open'
      }
    ]
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
