const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const amqp = require("amqplib");

const app = express();
const PORT = process.env.PORT || 8004;
const DATABASE_URL =
  process.env.DATABASE_URL || "mongodb://mongodb:27017/chatapp";
const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://guest:guest@rabbitmq:5672";

const corsOptions = {
  origin: function (origin, callback) {
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(helmet());
app.use(express.json());
app.use(cors(corsOptions));

// Schemas

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
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    service: {
      type: String,
      default: 'unknown',
    },
    category: {
      type: String,
      default: 'general',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: { expires: "6h" }, // Logs older than 6 hours will be automatically deleted
    },
  },
  {
    timestamps: true,
  },
);

const Log = mongoose.model("Log", logSchema);

// MongoDB Connection Function
async function connectMongoDB() {
  try {
    await mongoose.connect(DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
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
    await channel.assertQueue("logs", { durable: true });
    console.log('Connected to RabbitMQ and asserting queue "logs"');

    channel.consume(
      "logs",
      async (msg) => {
        if (msg !== null) {
          try {
            const logEntry = JSON.parse(msg.content.toString());
            console.log('Received log entry:', JSON.stringify(logEntry));
            
            // Validate required fields
            if (!logEntry.action) {
              console.error('Missing action field in log entry:', logEntry);
              // Nack and don't requeue invalid messages
              channel.nack(msg, false, false);
              return;
            }
            if (!logEntry.username) {
              console.error('Missing username field in log entry:', logEntry);
              // Nack and don't requeue invalid messages
              channel.nack(msg, false, false);
              return;
            }
            
            const log = new Log(logEntry);
            await log.save();
            channel.ack(msg);
          } catch (error) {
            console.error("Error processing log message:", error);
            console.error("Message content:", msg.content.toString());
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
    connection.on("close", () => {
      console.error("RabbitMQ connection closed. Attempting to reconnect...");
      setTimeout(setupRabbitMQConsumer, 5000); // Attempt to reconnect after 5 seconds
    });
    connection.on("error", (err) => {
      console.error("RabbitMQ connection error:", err);
    });
  } catch (err) {
    console.error("Failed to establish RabbitMQ connection or consumer:", err);
    // Attempt to reconnect if RabbitMQ connection fails
    setTimeout(setupRabbitMQConsumer, 5000); // Attempt to reconnect after 5 seconds
  }
}

// Routes

// Health check
app.get("/health", async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? "UP" : "DOWN";
  let rabbitMQStatus = "UNKNOWN"; // We'll try to determine this more robustly

  try {
    // Attempt to create a temporary connection/channel to verify RabbitMQ
    const tempConnection = await amqp.connect(RABBITMQ_URL);
    await tempConnection.createChannel();
    await tempConnection.close();
    rabbitMQStatus = "UP";
  } catch (error) {
    rabbitMQStatus = "DOWN";
  }

  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "log-service",
    dependencies: {
      mongodb: mongoStatus,
      rabbitmq: rabbitMQStatus,
    },
  });
});

// Log Routes
app.get("/api/logs", async (req, res, next) => {
  try {
    console.log("GET /api/logs - Request received");
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    console.log(`Fetching logs: page=${page}, limit=${limit}, skip=${skip}`);

    const logs = await Log.find().skip(skip).limit(limit).sort({
      timestamp: -1,
    });
    const totalLogs = await Log.countDocuments();
    
    console.log(`Found ${logs.length} logs out of ${totalLogs} total`);
    console.log("Sending response:", { page, limit, total: totalLogs, logsCount: logs.length });

    const response = {
      page,
      limit,
      total: totalLogs,
      logs,
    };
    
    res.json(response);
  } catch (error) {
    console.error("Error in GET /api/logs:", error);
    next(error); // Pass the error to the error handling middleware
  }
});

app.get("/api/logs/stats", async (req, res, next) => {
  try {
    const totalLogs = await Log.countDocuments();
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logsLast24h = await Log.countDocuments({ timestamp: { $gte: last24Hours } });
    
    // Get action breakdown
    const actionBreakdown = await Log.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      message: "Log statistics retrieved successfully",
      stats: {
        totalLogs,
        logsLast24h,
        actionBreakdown
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /logs/stats endpoint:", error);
    next(error);
  }
});

// Clear all logs
app.delete("/api/logs", async (req, res, next) => {
  try {
    const result = await Log.deleteMany({});
    
    console.log(`All logs cleared: ${result.deletedCount} logs deleted`);
    
    res.json({
      message: "All logs cleared successfully",
      deletedCount: result.deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error clearing logs:", error);
    next(error);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message: err.message, // Provide a more specific error message
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
});

// Start the server only after connections are established
async function startServer() {
  await connectMongoDB();
  await setupRabbitMQConsumer(); // This will also start consuming messages

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Log Service running on port ${PORT}`);
  });
}

startServer();
