const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const amqp = require("amqplib");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
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

// Initialize Socket.IO with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins for development - restrict in production
    methods: ["GET", "POST"],
    credentials: true,
  },
  path: "/ws/socket.io/", // This matches the /ws* pattern in Caddy
});

app.use(helmet());
app.use(express.json());
app.use(cors(corsOptions));

// Global variables
let channel = null;
let rabbitConnection = null;

// Store connected users
const connectedUsers = new Map();
const userSocketMap = new Map();

// Track sockets currently processing disconnect to prevent duplicate handling
const disconnectingSocketIds = new Set();

// WebRTC signaling data
const callSessions = new Map();

// User Schema (for tracking online users)
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

// Chat Schema
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
    room: {
      type: String,
      default: 'general',
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
    rabbitConnection = await amqp.connect(RABBITMQ_URL);
    channel = await rabbitConnection.createChannel();
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

            // WebSocket notification to connected clients
            io.emit("message", {
              _id: chat._id,
              message: chat.message,
              username: chat.username,
              timestamp: chat.timestamp,
              room: chat.room,
            });

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
    rabbitConnection.on("close", () => {
      console.error("RabbitMQ connection closed. Attempting to reconnect...");
      setTimeout(setupRabbitMQConsumer, 5000); // Attempt to reconnect after 5 seconds
    });
    rabbitConnection.on("error", (err) => {
      console.error("RabbitMQ connection error:", err);
    });
  } catch (err) {
    console.error("Failed to establish RabbitMQ connection or consumer:", err);
    // Attempt to reconnect if RabbitMQ connection fails
    setTimeout(setupRabbitMQConsumer, 5000); // Attempt to reconnect after 5 seconds
  }
}

// Helper functions
const logAction = async (action, username, details = {}) => {
  const logEntry = {
    action,
    username,
    details,
    timestamp: new Date(),
    service: 'chat-service'
  };

  console.log(`[LOG] ${action} - ${username}:`, details);

  try {
    if (channel) {
      await channel.sendToQueue("logs", Buffer.from(JSON.stringify(logEntry)), {
        persistent: true,
      });
    }
  } catch (error) {
    console.error("Error logging action to RabbitMQ:", error);
  }
};

// WebRTC-specific logging
const logWebRTCEvent = async (eventType, username, details = {}) => {
  const logEntry = {
    eventType,
    username,
    details,
    timestamp: new Date(),
    service: 'chat-service',
    category: 'webrtc'
  };

  console.log(`[WebRTC] ${eventType} - ${username}:`, details);

  try {
    if (channel) {
      await channel.sendToQueue("webrtc_events", Buffer.from(JSON.stringify(logEntry)), {
        persistent: true,
      });
      // For logs queue, use 'action' field instead of 'eventType'
      await channel.sendToQueue("logs", Buffer.from(JSON.stringify({
        action: eventType,
        username,
        details,
        timestamp: new Date(),
        service: 'chat-service',
        category: 'webrtc'
      })), {
        persistent: true,
      });
    }
  } catch (error) {
    console.error("Error logging WebRTC event to RabbitMQ:", error);
  }
};

// WebSocket-specific logging
const logWSEvent = async (eventType, username, details = {}) => {
  const logEntry = {
    action: eventType,
    username,
    details,
    timestamp: new Date(),
    service: 'chat-service',
    category: 'websocket'
  };

  console.log(`[WebSocket] ${eventType} - ${username}:`, details);

  try {
    if (channel) {
      await channel.sendToQueue("logs", Buffer.from(JSON.stringify(logEntry)), {
        persistent: true,
      });
    }
  } catch (error) {
    console.error("Error logging WebSocket event to RabbitMQ:", error);
  }
};

// WebSocket Connection Handling
io.on("connection", (socket) => {
  console.log(`[WebSocket] User connected: ${socket.id}`);

  logWSEvent('connection', 'unknown', { socketId: socket.id });

  // Handle user joining
  socket.on("join", async (data) => {
    const { username } = data;

    if (username) {
      socket.username = username;
      connectedUsers.set(socket.id, username);
      userSocketMap.set(username, socket.id);

      socket.join('general');

      // Log join event
      await logWSEvent('user_join', username, {
        socketId: socket.id,
        room: 'general'
      });

      // Update user status in database
      try {
        await User.findOneAndUpdate(
          { username },
          { isOnline: true, lastSeen: new Date() },
          { upsert: true, new: true }
        );
      } catch (error) {
        console.error("Error updating user status:", error);
      }

      // Broadcast updated user list
      const onlineUsers = Array.from(connectedUsers.values());
      io.emit('users', onlineUsers);

      // Send recent messages to new user
      try {
        const recentMessages = await Chat.find({})
          .sort({ timestamp: -1 })
          .limit(50)
          .lean();

        socket.emit('message-history', recentMessages.reverse());
      } catch (error) {
        console.error('Error fetching message history:', error);
      }

      // Send user joined message to RabbitMQ queue to appear in chat
      if (channel) {
        try {
          await channel.sendToQueue(
            "user_actions",
            Buffer.from(JSON.stringify({
              message: `User joined: ${username}`,
              username: "SYSTEM",
              timestamp: new Date(),
              room: 'general',
            })),
            { persistent: true }
          );
        } catch (error) {
          console.error("Error sending user joined message to RabbitMQ:", error);
        }
      }

      // Log the join action
      logAction("user_joined", username);

      console.log(`${username} joined the chat`);
    }
  });

  // Handle chat messages from WebSocket
  socket.on("message", async (data) => {
    try {
      const { username, message, timestamp } = data;

      // Validate message data
      if (!message || !username || message.trim().length === 0) {
        socket.emit("error", { message: "Invalid message data" });
        return;
      }

      if (message.length > 1000) {
        socket.emit("error", { message: "Message too long" });
        return;
      }

      if (username.length < 3 || username.length > 20) {
        socket.emit("error", { message: "Invalid username length" });
        return;
      }

      const trimmedMessage = message.trim();

      // Check for /clearchat command
      if (trimmedMessage === '/clearchat') {
        try {
          const result = await Chat.deleteMany({});

          // Notify all clients that chat was cleared
          io.emit("chat-cleared");

          // Send system message
          io.emit("message", {
            _id: Date.now(),
            message: `Chat cleared by ${username} (${result.deletedCount} messages deleted)`,
            username: "SYSTEM",
            timestamp: new Date(),
            room: 'general',
          });

          // Log the clear action
          logAction("chat_cleared", username, { deletedCount: result.deletedCount });

          console.log(`Chat cleared by ${username}: ${result.deletedCount} messages deleted`);
        } catch (error) {
          console.error("Error clearing chat:", error);
          socket.emit("error", { message: "Failed to clear chat" });
        }
        return;
      }

      // Check for /clearlogs command
      if (trimmedMessage === '/clearlogs') {
        try {
          // Send request to log service via RabbitMQ or HTTP
          const axios = require('axios');
          const LOG_SERVICE_URL = process.env.LOG_SERVICE_URL || 'http://log-service:8004';

          try {
            await axios.delete(`${LOG_SERVICE_URL}/api/logs`);
          } catch (httpError) {
            console.error("Failed to clear logs via HTTP, trying RabbitMQ:", httpError);
          }

          // Send system message
          io.emit("message", {
            _id: Date.now(),
            message: `Logs cleared by ${username}`,
            username: "SYSTEM",
            timestamp: new Date(),
            room: 'general',
          });

          // Log the clear action
          logAction("logs_cleared", username);

          console.log(`Logs cleared by ${username}`);
        } catch (error) {
          console.error("Error clearing logs:", error);
          socket.emit("error", { message: "Failed to clear logs" });
        }
        return;
      }

      // Send message to RabbitMQ queue for processing
      if (channel) {
        await channel.sendToQueue(
          "user_actions",
          Buffer.from(JSON.stringify({
            message: trimmedMessage,
            username: username.trim(),
            timestamp: timestamp || new Date(),
            room: 'general',
          })),
          { persistent: true }
        );
      } else {
        // Fallback: save directly to database if RabbitMQ is not available
        const chat = new Chat({
          message: trimmedMessage,
          username: username.trim(),
          timestamp: timestamp || new Date(),
          room: 'general',
        });

        const savedChat = await chat.save();

        // Broadcast to all connected clients
        io.emit("message", {
          _id: savedChat._id,
          message: savedChat.message,
          username: savedChat.username,
          timestamp: savedChat.timestamp,
          room: savedChat.room,
        });
      }

      // Log the message action
      logAction("message_sent", username, {
        messageLength: trimmedMessage.length,
        room: 'general'
      });

      console.log(`[Message] ${username}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);

    } catch (error) {
      console.error("Error handling message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    socket.broadcast.emit('user-typing', {
      username: socket.username,
      isTyping: data.isTyping
    });

    if (data.isTyping) {
      logWSEvent('typing_start', socket.username, { room: 'general' });
    }
  });

  // WebRTC Video Call Signaling

  // Handle call offer
  socket.on('call-offer', (data) => {
    const { target, offer } = data;
    const targetSocketId = userSocketMap.get(target);

    if (targetSocketId) {
      const callId = `${socket.username}-${target}-${Date.now()}`;
      callSessions.set(callId, {
        caller: socket.username,
        callee: target,
        callerSocketId: socket.id,
        calleeSocketId: targetSocketId,
        startTime: new Date()
      });

      io.to(targetSocketId).emit('call-offer', {
        from: socket.username,
        offer: offer
      });

      // Log call initiation
      logWebRTCEvent('call_initiated', socket.username, {
        target,
        callId,
        offerType: offer?.type || 'unknown'
      });

      console.log(`[Call] Offer from ${socket.username} to ${target} - CallID: ${callId}`);
    } else {
      // Log failed call attempt
      logWebRTCEvent('call_failed', socket.username, {
        target,
        reason: 'target_not_found'
      });
    }
  });

  // Handle call answer
  socket.on('call-answer', (data) => {
    const { target, answer } = data;
    const targetSocketId = userSocketMap.get(target);

    if (targetSocketId) {
      io.to(targetSocketId).emit('call-answer', {
        from: socket.username,
        answer: answer
      });

      // Log call answer
      logWebRTCEvent('call_answered', socket.username, {
        caller: target,
        answerType: answer?.type || 'unknown'
      });

      console.log(`[Call] Answer from ${socket.username} to ${target}`);
    }
  });

  // Handle ICE candidates
  socket.on('ice-candidate', (data) => {
    const { target, candidate } = data;
    const targetSocketId = userSocketMap.get(target);

    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', data);

      // Log ICE candidate exchange (only log type, not full candidate for brevity)
      logWebRTCEvent('ice_candidate_exchange', socket.username, {
        target,
        candidateType: candidate?.candidate?.includes('typ') ?
          candidate.candidate.split('typ ')[1]?.split(' ')[0] : 'unknown'
      });
    }
  });

  // Handle call end
  socket.on('call-end', () => {
    // Find and clean up call session
    let targetSocketId = null;
    let callIdToRemove = null;
    let session = null;

    for (const [callId, s] of callSessions.entries()) {
      if (s.callerSocketId === socket.id) {
        targetSocketId = s.calleeSocketId;
        callIdToRemove = callId;
        session = s;
        break;
      } else if (s.calleeSocketId === socket.id) {
        targetSocketId = s.callerSocketId;
        callIdToRemove = callId;
        session = s;
        break;
      }
    }

    if (targetSocketId) {
      io.to(targetSocketId).emit('call-end');
    }

    if (callIdToRemove && session) {
      const duration = Date.now() - new Date(session.startTime).getTime();
      callSessions.delete(callIdToRemove);

      // Log call end with duration
      logWebRTCEvent('call_ended', socket.username, {
        callId: callIdToRemove,
        caller: session.caller,
        callee: session.callee,
        durationMs: duration,
        durationSec: Math.round(duration / 1000),
        endedBy: socket.username
      });
    }

    console.log(`[Call] Ended by ${socket.username}`);
  });

  // Handle ICE candidates
  socket.on('ice-candidate', (candidate) => {
    // Find the call session this socket is part of
    let targetSocketId = null;

    for (const [callId, session] of callSessions.entries()) {
      if (session.callerSocketId === socket.id) {
        targetSocketId = session.calleeSocketId;
        break;
      } else if (session.calleeSocketId === socket.id) {
        targetSocketId = session.callerSocketId;
        break;
      }
    }

    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', candidate);
    }
  });

  // Handle call end
  socket.on('call-end', () => {
    // Find and clean up call session
    let targetSocketId = null;
    let callIdToRemove = null;

    for (const [callId, session] of callSessions.entries()) {
      if (session.callerSocketId === socket.id) {
        targetSocketId = session.calleeSocketId;
        callIdToRemove = callId;
        break;
      } else if (session.calleeSocketId === socket.id) {
        targetSocketId = session.callerSocketId;
        callIdToRemove = callId;
        break;
      }
    }

    if (targetSocketId) {
      io.to(targetSocketId).emit('call-end');
    }

    if (callIdToRemove) {
      callSessions.delete(callIdToRemove);
    }

    console.log(`Call ended by ${socket.username}`);
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    socket.broadcast.emit('user-typing', {
      username: socket.username,
      isTyping: data.isTyping
    });
  });

  // Handle user disconnection
  socket.on("disconnect", async () => {
    // Prevent duplicate disconnect processing
    if (disconnectingSocketIds.has(socket.id)) {
      console.log(`[WebSocket] Disconnect already in progress for socket ${socket.id} - ignoring duplicate`);
      return;
    }

    const username = connectedUsers.get(socket.id);

    // Check if user exists to prevent disconnect handling for sockets that never joined
    if (!username) {
      console.log(`[WebSocket] Disconnect for socket ${socket.id} - no username (never joined)`);
      return;
    }

    console.log(`[WebSocket] Processing disconnect for ${username} (socket: ${socket.id})`);

    // Mark this socket as disconnecting to prevent duplicate processing
    disconnectingSocketIds.add(socket.id);

    // Remove user from connected users immediately
    connectedUsers.delete(socket.id);
    userSocketMap.delete(username);

    // Update user status in database
    try {
      await User.findOneAndUpdate(
        { username },
        { isOnline: false, lastSeen: new Date() }
      );
    } catch (error) {
      console.error("Error updating user status on disconnect:", error);
    }

    // Clean up any ongoing calls
    let callIdToRemove = null;
    let targetSocketId = null;
    let session = null;

    for (const [callId, s] of callSessions.entries()) {
      if (s.callerSocketId === socket.id || s.calleeSocketId === socket.id) {
        targetSocketId = s.callerSocketId === socket.id ?
          s.calleeSocketId : s.callerSocketId;
        callIdToRemove = callId;
        session = s;
        break;
      }
    }

    if (targetSocketId) {
      io.to(targetSocketId).emit('call-end');
    }

    if (callIdToRemove && session) {
      const duration = Date.now() - new Date(session.startTime).getTime();
      callSessions.delete(callIdToRemove);

      // Log call disconnection
      logWebRTCEvent('call_disconnected', username, {
        callId: callIdToRemove,
        caller: session.caller,
        callee: session.callee,
        durationMs: duration,
        durationSec: Math.round(duration / 1000),
        reason: 'user_disconnected'
      });
    }

    // Broadcast updated user list
    const onlineUsers = Array.from(connectedUsers.values());
    io.emit('users', onlineUsers);

    // Send user left message to RabbitMQ queue to appear in chat
    if (channel) {
      try {
        await channel.sendToQueue(
          "user_actions",
          Buffer.from(JSON.stringify({
            message: `User left: ${username}`,
            username: "SYSTEM",
            timestamp: new Date(),
            room: 'general',
          })),
          { persistent: true }
        );
      } catch (error) {
        console.error("Error sending user left message to RabbitMQ:", error);
      }
    }

    // Log the disconnect action
    logWSEvent("user_disconnected", username, {
      socketId: socket.id,
      hadActiveCall: !!callIdToRemove
    });

    console.log(`[WebSocket] ${username} disconnected - processing complete`);

    // Clean up the disconnecting flag after processing
    disconnectingSocketIds.delete(socket.id);
  });

});

// Routes

// Health check
app.get("/health", async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? "UP" : "DOWN";
  let rabbitMQStatus = "UNKNOWN";

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
    websocket: {
      connectedUsers: connectedUsers.size,
      activeCalls: callSessions.size,
    },
  });
});

// Chat API Routes

// Get all chat messages (with pagination)
app.get("/api/chat/messages", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Chat.find()
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalMessages = await Chat.countDocuments();
    const totalPages = Math.ceil(totalMessages / limit);

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        currentPage: page,
        totalPages,
        totalMessages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Get recent chat messages (last N messages)
app.get("/api/chat/messages/recent", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const excludeSystem = req.query.excludeSystem === 'true';

    const query = excludeSystem ? { username: { $ne: 'SYSTEM' } } : {};

    const messages = await Chat.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      count: messages.length,
    });
  } catch (error) {
    console.error("Error fetching recent messages:", error);
    res.status(500).json({ error: "Failed to fetch recent messages" });
  }
});

// Get recent user messages only (excluding system messages)
app.get("/api/chat/messages/user", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const messages = await Chat.find({ username: { $ne: 'SYSTEM' } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      count: messages.length,
    });
  } catch (error) {
    console.error("Error fetching user messages:", error);
    res.status(500).json({ error: "Failed to fetch user messages" });
  }
});

// Post a new message (alternative to WebSocket)
app.post("/api/chat/messages", async (req, res) => {
  try {
    const { message, username, room = 'general' } = req.body;

    // Validate input
    if (!message || !username) {
      return res.status(400).json({ error: "Message and username are required" });
    }

    if (message.trim().length === 0) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    if (message.length > 1000) {
      return res.status(400).json({ error: "Message too long (max 1000 characters)" });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: "Username must be between 3 and 20 characters" });
    }

    // Send message to RabbitMQ queue for processing
    if (channel) {
      await channel.sendToQueue(
        "user_actions",
        Buffer.from(JSON.stringify({
          message: message.trim(),
          username: username.trim(),
          room: room.trim(),
        })),
        { persistent: true }
      );

      res.status(202).json({
        message: "Message queued for processing",
        timestamp: new Date().toISOString(),
      });
    } else {
      // Fallback: save directly to database if RabbitMQ is not available
      const chat = new Chat({
        message: message.trim(),
        username: username.trim(),
        room: room.trim(),
      });

      const savedChat = await chat.save();

      // Broadcast to WebSocket clients
      io.emit("message", {
        _id: savedChat._id,
        message: savedChat.message,
        username: savedChat.username,
        timestamp: savedChat.timestamp,
        room: savedChat.room,
      });

      res.status(201).json({
        _id: savedChat._id,
        message: savedChat.message,
        username: savedChat.username,
        timestamp: savedChat.timestamp,
        room: savedChat.room,
      });
    }

    // Log the message action
    logAction("message_sent_api", username);

  } catch (error) {
    console.error("Error posting message:", error);
    res.status(500).json({ error: "Failed to post message" });
  }
});

// Get connection stats
app.get('/api/chat/stats', async (req, res) => {
  try {
    const totalMessages = await Chat.countDocuments();
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const messagesLast24h = await Chat.countDocuments({ timestamp: { $gte: last24Hours } });

    // Get most active users
    const mostActiveUsers = await Chat.aggregate([
      { $group: { _id: '$username', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      connectedUsers: Array.from(connectedUsers.values()),
      totalConnections: connectedUsers.size,
      activeCalls: callSessions.size,
      totalMessages,
      messagesLast24h,
      mostActiveUsers,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching chat stats:', error);
    res.status(500).json({ error: 'Failed to fetch chat statistics' });
  }
});

// Get online users
app.get('/api/chat/users', (req, res) => {
  res.json({
    users: Array.from(connectedUsers.values()),
    count: connectedUsers.size,
    timestamp: new Date().toISOString()
  });
});

// Delete a message (admin functionality)
app.delete("/api/chat/messages/:id", async (req, res) => {
  try {
    const messageId = req.params.id;

    const deletedMessage = await Chat.findByIdAndDelete(messageId);

    if (!deletedMessage) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Notify WebSocket clients about message deletion
    io.emit("message-deleted", { messageId });

    // Log the deletion action
    logAction("message_deleted", "admin");

    res.json({ message: "Message deleted successfully" });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ error: "Failed to delete message" });
  }
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

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");

  if (rabbitConnection) {
    await rabbitConnection.close();
  }

  await mongoose.connection.close();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

// Start the server only after connections are established
async function startServer() {
  await connectMongoDB();
  await setupRabbitMQConsumer();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Chat Service running on port ${PORT}`);
    console.log(`WebSocket server available at ws://localhost:${PORT}/ws/socket.io/`);
  });
}

startServer();
