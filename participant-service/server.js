const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 8003;
const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://mongodb:27017/chatapp';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';

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
try {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue('user_actions', { durable: true });
  await channel.assertQueue('logs', { durable: true });
  console.log('Connected to RabbitMQ');
} catch (error) {
  console.error('RabbitMQ connection error:', error);
}

// Helper functions
const logAction = async (action, username) => {
  const logEntry = { action, username, timestamp: new Date() };
  try {
    await channel.sendToQueue('logs', Buffer.from(JSON.stringify(logEntry)), { persistent: true });
  } catch (error) {
    console.error('Error logging action to RabbitMQ:', error);
  }
};

const sendUserAction = async (action, username) => {
  const userAction = { action, username, timestamp: new Date() };
  try {
    await channel.sendToQueue('user_actions', Buffer.from(JSON.stringify(userAction)), { persistent: true });
  } catch (error) {
    console.error('Error sending user action to RabbitMQ:', error);
  }
};

// Schemas

// User Schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'participant-service'
  });
});

// Auth Routes
app.post('/api/participants/join', async (req, res, next) => {
  // TODO: Implement join logic
});

app.post('/api/participants/leave', async (req, res, next) => {
  // TODO: Implement leave logic
});

app.get('/api/participants', async (req, res, next) => {
  // TODO: Implement get participants logic
});

app.get('/api/participants/online', async (req, res, next) => {
  // TODO: Implement get online participants logic
});



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
