const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 8003;
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
  await channel.assertQueue('user_actions', { durable: true });
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
    default: Date.now,
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
    try {
    const { username } = req.body;
    
    // Validate input
    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        error: 'Username is required and must be a string',
        timestamp: new Date().toISOString()
      });
    }

    // Trim and validate username length
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return res.status(400).json({
        error: 'Username must be between 3 and 20 characters',
        timestamp: new Date().toISOString()
      });
    }

    // Check if user already exists
    let user = await User.findOne({ username: trimmedUsername });
    
    if (user) {
      // User exists, update their online status
      user.isOnline = true;
      user.lastSeen = new Date();
      await user.save();
    } else {
      // Create new user
      user = new User({
        username: trimmedUsername,
        isOnline: true,
        lastSeen: new Date()
      });
      await user.save();
    }

    // Log the action to RabbitMQ
    await logAction('user_joined', trimmedUsername);
    await sendUserAction('join', trimmedUsername);

    res.status(200).json({
      message: 'User joined successfully',
      user: {
        id: user._id,
        username: user.username,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /join endpoint:', error);
    
    // Handle duplicate key error (race condition)
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Username already exists',
        timestamp: new Date().toISOString()
      });
    }
    
    next(error);
  }
});

app.post('/api/participants/leave', async (req, res, next) => {
  // TODO: Implement leave logic
  try {
    const { username } = req.body;
    
    // Validate input
    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        error: 'Username is required and must be a string',
        timestamp: new Date().toISOString()
      });
    }

    const trimmedUsername = username.trim();

    // Find and update user
    const user = await User.findOne({ username: trimmedUsername });
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        timestamp: new Date().toISOString()
      });
    }

    // Set user as offline
    user.isOnline = false;
    user.lastSeen = new Date();
    await user.save();

    // Log the action to RabbitMQ
    await logAction('user_left', trimmedUsername);
    await sendUserAction('leave', trimmedUsername);

    res.status(200).json({
      message: 'User left successfully',
      user: {
        id: user._id,
        username: user.username,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /leave endpoint:', error);
    next(error);
  }
});

app.get('/api/participants', async (req, res, next) => {
  try {
    // Get all participants
    const participants = await User.find({}).select('-__v').sort({ username: 1 });

    res.status(200).json({
      message: 'Participants retrieved successfully',
      participants,
      count: participants.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /participants endpoint:', error);
    next(error);
  }
});

app.get('/api/participants/online', async (req, res, next) => {
  try {
    // Get only online participants
    const onlineParticipants = await User.find({ isOnline: true })
      .select('-__v')
      .sort({ username: 1 });

    res.status(200).json({
      message: 'Online participants retrieved successfully',
      participants: onlineParticipants,
      count: onlineParticipants.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /participants/online endpoint:', error);
    next(error);
  }
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
