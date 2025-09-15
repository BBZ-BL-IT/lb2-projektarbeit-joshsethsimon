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
    // For development, allow all origins. In production, specify allowed origins.
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Schemas

// Log Schema
const logSchema = new mongoose.Schema(
  {
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
      index: { expires: '6h' }, // Logs older than 6 hours will be automatically deleted
    },
  },
  {
    timestamps: true,
  },
);

const Log = mongoose.model('Log', logSchema);

// MongoDB Connection Function
async function connectMongoDB() {
  try {
    await mongoose.connect(DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    // Exit the process if MongoDB connection fails, as it's a critical dependency
    process.exit(1);
  }
}

// RabbitMQ Connection and Consumer Setup
async function setupRabbitMQConsumer() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    channel.prefetch(1); // Process one message at a time
    await channel.assertQueue('logs', { durable: true });
    console.log('Connected to RabbitMQ and asserting queue "logs"');

    channel.consume(
      'logs',
      async (msg) => {
        if (msg !== null) {
          const logEntry = JSON.parse(msg.content.toString());
          try {
            const log = new Log(logEntry);
            await log.save();
            channel.ack(msg);
          } catch (error) {
            console.error('Error saving log to MongoDB:', error);
            // Nack the message to requeue it, preventing data loss
            channel.nack(msg, false, true);
          }
        }
      },
      {
        noAck: false, // Ensure manual acknowledgment
      },
    );

    // Handle connection close and errors
    connection.on('close', () => {
      console.error('RabbitMQ connection closed. Attempting to reconnect...');
      setTimeout(setupRabbitMQConsumer, 5000); // Attempt to reconnect after 5 seconds
    });
    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
    });
  } catch (err) {
    console.error('Failed to establish RabbitMQ connection or consumer:', err);
    // Attempt to reconnect if RabbitMQ connection fails
    setTimeout(setupRabbitMQConsumer, 5000); // Attempt to reconnect after 5 seconds
  }
}

// Routes

// Health check
app.get('/health', async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'UP' : 'DOWN';
  let rabbitMQStatus = 'UNKNOWN'; // We'll try to determine this more robustly

  try {
    // Attempt to create a temporary connection/channel to verify RabbitMQ
    const tempConnection = await amqp.connect(RABBITMQ_URL);
    await tempConnection.createChannel();
    await tempConnection.close();
    rabbitMQStatus = 'UP';
  } catch (error) {
    rabbitMQStatus = 'DOWN';
  }

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'log-service',
    dependencies: {
      mongodb: mongoStatus,
      rabbitmq: rabbitMQStatus,
    },
  });
});

// Log Routes
app.get('/api/logs', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const logs = await Log.find().skip(skip).limit(limit).sort({
      timestamp: -1,
    });
    const totalLogs = await Log.countDocuments();

    res.json({
      page,
      limit,
      total: totalLogs,
      logs,
    });
  } catch (error) {
    next(error); // Pass the error to the error handling middleware
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message, // Provide a more specific error message
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// Start the server only after connections are established
async function startServer() {
  await connectMongoDB();
  await setupRabbitMQConsumer(); // This will also start consuming messages

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Log Service running on port ${PORT}`);
  });
}

startServer();
