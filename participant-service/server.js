const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const amqp = require("amqplib");

const app = express();
const PORT = process.env.PORT || 8003;
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

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model("User", userSchema);

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

// RabbitMQ Connection
async function setupRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue("logs", { durable: true });
    console.log('Connected to RabbitMQ and asserting queue "logs"');
    await channel.assertQueue("user_actions", { durable: true });
    console.log('Asserting queue "user_actions"');

    // Handle connection close and errors
    connection.on("close", () => {
      console.error("RabbitMQ connection closed. Attempting to reconnect...");
      setTimeout(setupRabbitMQ, 5000); // Attempt to reconnect after 5 seconds
    });
    connection.on("error", (err) => {
      console.error("RabbitMQ connection error:", err);
    });
  } catch (err) {
    console.error("Failed to establish RabbitMQ connection:", err);
    // Attempt to reconnect if RabbitMQ connection fails
    setTimeout(setupRabbitMQ, 5000); // Attempt to reconnect after 5 seconds
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

const sendUserAction = async (action, username) => {
  const userAction = { action, username, timestamp: new Date() };
  try {
    await channel.sendToQueue(
      "user_actions",
      Buffer.from(JSON.stringify(userAction)),
      { persistent: true },
    );
  } catch (error) {
    console.error("Error sending user action to RabbitMQ:", error);
  }
};

// Schemas

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
    service: "participant-service",
    dependencies: {
      mongodb: mongoStatus,
      rabbitmq: rabbitMQStatus,
    },
  });
});

// Auth Routes
app.post("/api/participants/join", async (req, res, next) => {
  // TODO: Implement join logic
  try {
    const { username } = req.body;

    // Validate input
    if (!username || typeof username !== "string") {
      return res.status(400).json({
        error: "Username is required and must be a string",
        timestamp: new Date().toISOString(),
      });
    }

    // Trim and validate username length
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return res.status(400).json({
        error: "Username must be between 3 and 20 characters",
        timestamp: new Date().toISOString(),
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
        lastSeen: new Date(),
      });
      await user.save();
    }

    // Log the action to RabbitMQ
    await logAction("user_joined", trimmedUsername);
    await sendUserAction("join", trimmedUsername);

    res.status(200).json({
      message: "User joined successfully",
      user: {
        id: user._id,
        username: user.username,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /join endpoint:", error);

    // Handle duplicate key error (race condition)
    if (error.code === 11000) {
      return res.status(409).json({
        error: "Username already exists",
        timestamp: new Date().toISOString(),
      });
    }

    next(error);
  }
});

app.post("/api/participants/leave", async (req, res, next) => {
  // TODO: Implement leave logic
  try {
    const { username } = req.body;

    // Validate input
    if (!username || typeof username !== "string") {
      return res.status(400).json({
        error: "Username is required and must be a string",
        timestamp: new Date().toISOString(),
      });
    }

    const trimmedUsername = username.trim();

    // Find and update user
    const user = await User.findOne({ username: trimmedUsername });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
        timestamp: new Date().toISOString(),
      });
    }

    // Set user as offline
    user.isOnline = false;
    user.lastSeen = new Date();
    await user.save();

    // Log the action to RabbitMQ
    await logAction("user_left", trimmedUsername);
    await sendUserAction("leave", trimmedUsername);

    res.status(200).json({
      message: "User left successfully",
      user: {
        id: user._id,
        username: user.username,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /leave endpoint:", error);
    next(error);
  }
});

app.get("/api/participants", async (req, res, next) => {
  try {
    // Get all participants
    const participants = await User.find({})
      .select("-__v")
      .sort({ username: 1 });

    res.status(200).json({
      message: "Participants retrieved successfully",
      participants,
      count: participants.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /participants endpoint:", error);
    next(error);
  }
});

app.get("/api/participants/online", async (req, res, next) => {
  try {
    // Get only online participants
    const onlineParticipants = await User.find({ isOnline: true })
      .select("-__v")
      .sort({ username: 1 });

    res.status(200).json({
      message: "Online participants retrieved successfully",
      participants: onlineParticipants,
      count: onlineParticipants.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /participants/online endpoint:", error);
    next(error);
  }
});

app.get("/api/participants", async (req, res, next) => {
  // TODO: Implement get participants logic
});

app.get("/api/participants/online", async (req, res, next) => {
  // TODO: Implement get online participants logic
});

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
  await setupRabbitMQ();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Participant Service running on port ${PORT}`);
  });
}

startServer();
