const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 8004;
const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://mongodb:27017/chatapp';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';

// Middleware
app.use(helmet());

// CORS Configuration - erlaubt alle Origins für lokales Netzwerk
const corsOptions = {
  origin: function (origin, callback) {
    // Erlaube alle Origins (für lokales Netzwerk)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

app.use(express.json());

// MongoDB Connection
mongoose.connect(DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));


// RabbitMQ Connection
async function connectRabbitMQ() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue('logs', { durable: true });
  console.log('Connected to RabbitMQ');
  return channel;
}

let channel;
connectRabbitMQ().then(ch => {
  channel = ch;
}).catch(err => {
  console.error('Failed to establish RabbitMQ channel:', err);
});

// Schemas

// Log Schema
const logSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  }
}, {
  timestamps: true
});

const Log = mongoose.model('Log', logSchema);

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'log-service'
  });
});

// Log Routes
app.get('/api/logs', async (req, res, next) => {
  // TODO: Implement get logs logic with pagination
  // Example: /api/logs?page=1&limit=20
});

// Handle Log Queue
channel.prefetch(1); // Process one message at a time
channel.consume('logs', async (msg) => {
  if (msg !== null) {
    const logEntry = JSON.parse(msg.content.toString());
    try {
      const log = new Log(logEntry);
      await log.save();
      channel.ack(msg);
    } catch (error) {
      console.error('Error saving log to MongoDB:', error);
      // Optionally, you can nack the message to requeue it
      channel.nack(msg, false, true);
    }
  }
}).catch(err => {
  console.error('Error consuming messages from RabbitMQ:', err);
});

// Clean up old logs every day
setInterval(async () => {
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours ago
  try {
    const result = await Log.deleteMany({ timestamp: { $lt: cutoff } });
    console.log(`Cleaned up ${result.deletedCount} old logs`);
  } catch (error) {
    console.error('Error cleaning up old logs:', error);
  }
}, 60 * 60 * 1000); // Every hour

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong! Error: ' + JSON.stringify(err),
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
});
