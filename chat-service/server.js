const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const amqp = require("amqplib");

const app = express();
const PORT = process.env.PORT || 8001;
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
const chatSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

const Chat = mongoose.model("Chat", chatSchema);

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
    await channel.assertQueue("user_actions", { durable: true });
    console.log('Asserting queue "user_actions"');

    channel.consume(
      "user_actions",
      async (msg) => {
        if (msg !== null) {
          const userAction = JSON.parse(msg.content.toString());
          try {
            const chat = new Chat(userAction);
            await chat.save();
            // TODO: Implement websocket notification to connected clients
            channel.ack(msg);
          } catch (error) {
            console.error("Error saving chat message to MongoDB:", error);
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

// Helper functions
const logAction = async (action, username) => {
  const logEntry = { action, username, timestamp: new Date() };
  try {
    await channel.sendToQueue("logs", Buffer.from(JSON.stringify(logEntry)), {
      persistent: true,
    });
  } catch (error) {
    console.error("Error logging action to RabbitMQ:", error);
  }
};

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
    service: "chat-service",
    dependencies: {
      mongodb: mongoStatus,
      rabbitmq: rabbitMQStatus,
    },
  });
});

// TODO: Add the necessary routes for chat functionality
// TODO: Add the websocket server for real-time chat updates

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong! Error: " + JSON.stringify(err),
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
  await setupRabbitMQConsumer();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Chat Service running on port ${PORT}`);
  });
}

startServer();
