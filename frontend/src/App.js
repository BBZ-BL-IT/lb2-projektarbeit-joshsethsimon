import React, { useState, useEffect, useRef, useCallback } from "react";
import { Container, Box, Alert, IconButton } from "@mui/material";
import { Menu } from "@mui/icons-material";
import io from "socket.io-client";
import axios from "axios";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";

// Components
import LoginScreen from "./components/LoginScreen";
import ChatHeader from "./components/ChatHeader";
import OnlineUsersPanel from "./components/OnlineUsersPanel";
import ChatPanel from "./components/ChatPanel";
import VideoCallDialog from "./components/VideoCallDialog";
import IncomingCallDialog from "./components/IncomingCallDialog";

// Pages
import Statistics from "./Statistics";
import Logs from "./Logs";
import TurnStats from "./TurnStats";

// Hooks and Utils
import { useWebRTC } from "./hooks/useWebRTC_simple_peer";
import { isTurnServiceAvailable } from "./utils/webrtc-helper";

const API_URL = process.env.REACT_APP_API_URL || "";

function ChatApp() {
  const navigate = useNavigate();
  
  // State
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isUsersPanelOpen, setIsUsersPanelOpen] = useState(true);
  const [turnServiceAvailable, setTurnServiceAvailable] = useState(false);
  const [hideSystemMessages, setHideSystemMessages] = useState(() => {
    const saved = localStorage.getItem('hideSystemMessages');
    return saved === 'true';
  });

  // Refs
  const typingTimeoutRef = useRef(null);

  // WebRTC Hook
  const webrtc = useWebRTC(socket);

  // Load messages and users
  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const endpoint = hideSystemMessages 
        ? `${API_URL}/api/chat/messages/user`
        : `${API_URL}/api/chat/messages/recent`;
      
      const response = await axios.get(endpoint, {
        params: { limit: 50 },
      });

      if (response.data.messages) {
        setMessages(response.data.messages);
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
      setError("Failed to load chat history");
    } finally {
      setLoading(false);
    }
  }, [hideSystemMessages]);

  const loadOnlineUsers = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/chat/users`);
      if (response.data.users) {
        setOnlineUsers(response.data.users.filter((u) => u !== username));
      }
    } catch (error) {
      console.error("Failed to load online users:", error);
    }
  }, [username]);

  // Check for stored credentials on component mount
  useEffect(() => {
    const checkStoredAuth = async () => {
      const storedUsername = localStorage.getItem("chatUsername");

      if (storedUsername) {
        try {
          await axios.post(`${API_URL}/api/participants/join`, {
            username: storedUsername,
          });

          setUsername(storedUsername);
          setIsLoggedIn(true);
          setError("");
        } catch (error) {
          console.error("Stored login failed:", error);
          localStorage.removeItem("chatUsername");
        }
      }

      setCheckingAuth(false);
    };

    checkStoredAuth();
  }, []);

  // Check TURN service availability
  useEffect(() => {
    const checkTurnService = async () => {
      const available = await isTurnServiceAvailable();
      setTurnServiceAvailable(available);
      if (available) {
        console.log("STUN/TURN service is available");
      } else {
        console.log(
          "STUN/TURN service is not available, will use fallback public STUN servers",
        );
      }
    };

    checkTurnService();
    const interval = setInterval(checkTurnService, 30000);
    return () => clearInterval(interval);
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    if (isLoggedIn && username) {
      try {
        const newSocket = io(window.location.origin, {
          transports: ["websocket", "polling"],
          timeout: 20000,
          path: "/ws/socket.io/",
          forceNew: true,
        });

        newSocket.on("connect", () => {
          console.log("Connected to WebSocket server");
          newSocket.emit("join", { username });
          setError("");
        });

        newSocket.on("connect_error", (err) => {
          console.error("WebSocket connection error:", err);
          setError("Failed to connect to chat server");
        });

        newSocket.on("message", (data) => {
          setMessages((prev) => [...prev, data]);
        });

        newSocket.on("new_message", (data) => {
          setMessages((prev) => [...prev, data]);
        });

        newSocket.on("message-history", (history) => {
          setMessages(history);
        });

        newSocket.on("users", (users) => {
          setOnlineUsers(users.filter((u) => u !== username));
        });

        newSocket.on("user_joined", (data) => {
          console.log(`${data.username} joined the chat`);
        });

        newSocket.on("user_left", (data) => {
          console.log(`${data.username} left the chat`);
        });

        newSocket.on("user-typing", (data) => {
          setTypingUsers((prev) => {
            if (data.isTyping) {
              return prev.includes(data.username)
                ? prev
                : [...prev, data.username];
            } else {
              return prev.filter((user) => user !== data.username);
            }
          });
        });

        // WebRTC event handlers with Simple-Peer
        newSocket.on("webrtc-signal", webrtc.handleSignal);
        newSocket.on("call-end", webrtc.handleCallEnd);
        newSocket.on("call-declined", () => {
          console.log("Call was declined");
          webrtc.handleCallEnd();
        });

        newSocket.on("message-deleted", (data) => {
          setMessages((prev) =>
            prev.filter((msg) => msg._id !== data.messageId),
          );
        });

        newSocket.on("chat-cleared", () => {
          setMessages([]);
        });

        newSocket.on("error", (data) => {
          setError(data.message);
        });

        setSocket(newSocket);

        return () => {
          newSocket.disconnect();
        };
      } catch (err) {
        console.error("Failed to initialize WebSocket:", err);
        setError("Failed to initialize chat connection");
      }
    }
  }, [isLoggedIn, username, hideSystemMessages, webrtc.handleSignal, webrtc.handleCallEnd]);

  useEffect(() => {
    if (isLoggedIn) {
      loadMessages();
      loadOnlineUsers();
    }
  }, [isLoggedIn, hideSystemMessages, loadMessages, loadOnlineUsers]);

  const handleLogin = async () => {
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    if (username.trim().length < 3 || username.trim().length > 20) {
      setError("Username must be between 3 and 20 characters");
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
      setError(
        "Username can only contain letters, numbers, underscores, and hyphens",
      );
      return;
    }

    try {
      setLoading(true);
      setError("");

      await axios.post(`${API_URL}/api/participants/join`, {
        username: username.trim(),
      });

      localStorage.setItem("chatUsername", username.trim());
      setIsLoggedIn(true);
    } catch (error) {
      console.error("Login failed:", error);
      if (error.response?.status === 409) {
        setError("Username already taken. Please choose another.");
      } else {
        setError(
          error.response?.data?.error || "Login failed. Please try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (username) {
        await axios.post(`${API_URL}/api/participants/leave`, {
          username: username.trim(),
        });
      }
    } catch (error) {
      console.error("Logout failed:", error);
    }

    localStorage.removeItem("chatUsername");

    if (socket) {
      socket.disconnect();
    }

    setIsLoggedIn(false);
    setUsername("");
    setMessages([]);
    setOnlineUsers([]);
    setError("");
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const messageData = {
      username: username.trim(),
      message: newMessage.trim(),
      room: "general",
    };

    try {
      if (socket && socket.connected) {
        socket.emit("message", {
          ...messageData,
          timestamp: new Date().toISOString(),
        });

        setNewMessage("");
        setError("");
      } else {
        await axios.post(`${API_URL}/api/chat/messages`, messageData);
        setNewMessage("");
        setError("");
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setError("Failed to send message. Please try again.");
    }

    if (socket && socket.connected) {
      socket.emit("typing", { isTyping: false });
    }
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);

    if (socket && socket.connected) {
      socket.emit("typing", { isTyping: true });

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("typing", { isTyping: false });
      }, 1000);
    }
  };

  const toggleSystemMessages = () => {
    const newValue = !hideSystemMessages;
    setHideSystemMessages(newValue);
    localStorage.setItem('hideSystemMessages', newValue.toString());
    // Reload messages with the new filter setting
    // Note: We don't call loadMessages() here because it uses the old hideSystemMessages value
    // The useEffect with [hideSystemMessages] dependency will trigger the reload
  };

  const refreshData = () => {
    loadMessages();
    loadOnlineUsers();
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Show loading state while checking authentication
  if (checkingAuth) {
    return (
      <Container
        maxWidth="sm"
        style={{ marginTop: "50px", textAlign: "center" }}
      >
        <Box elevation={3} style={{ padding: "30px" }}>
          <h5>Loading...</h5>
          <p>Checking authentication</p>
        </Box>
      </Container>
    );
  }

  // Show login screen
  if (!isLoggedIn) {
    return (
      <LoginScreen
        username={username}
        setUsername={setUsername}
        onLogin={handleLogin}
        loading={loading}
        error={error}
      />
    );
  }

  // Main chat interface
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f7fa" }}>
      <ChatHeader
        username={username}
        turnServiceAvailable={turnServiceAvailable}
        hideSystemMessages={hideSystemMessages}
        onNavigateStatistics={() => navigate("/statistics")}
        onNavigateLogs={() => navigate("/logs")}
        onNavigateTurnStats={() => navigate("/turn-stats")}
        onRefresh={refreshData}
        onToggleSystemMessages={toggleSystemMessages}
        onLogout={handleLogout}
      />

      <Container maxWidth="lg" sx={{ marginTop: "30px", marginBottom: "30px" }}>
        {error && (
          <Alert
            severity="error"
            sx={{
              marginBottom: "20px",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
            onClose={() => setError("")}
          >
            {error}
          </Alert>
        )}

        <Box display="flex" gap={3}>
          {/* Toggle Button for Users Panel */}
          {!isUsersPanelOpen && (
            <IconButton
              onClick={() => setIsUsersPanelOpen(true)}
              sx={{
                position: "fixed",
                left: 20,
                top: 100,
                zIndex: 1000,
                backgroundColor: "#667eea",
                color: "white",
                "&:hover": {
                  backgroundColor: "#5568d3",
                },
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              <Menu />
            </IconButton>
          )}

          {/* Online Users Panel */}
          {isUsersPanelOpen && (
            <OnlineUsersPanel
              users={onlineUsers}
              onStartCall={webrtc.startCall}
              onClose={() => setIsUsersPanelOpen(false)}
            />
          )}

          {/* Chat Panel */}
          <ChatPanel
            messages={messages}
            username={username}
            newMessage={newMessage}
            setNewMessage={setNewMessage}
            onSendMessage={sendMessage}
            onTyping={handleTyping}
            typingUsers={typingUsers}
            socketConnected={socket?.connected}
            loading={loading}
            hideSystemMessages={hideSystemMessages}
          />
        </Box>
      </Container>

      {/* Incoming Call Dialog */}
      <IncomingCallDialog
        open={!!webrtc.incomingCall}
        caller={webrtc.incomingCall?.from}
        onAccept={webrtc.acceptCall}
        onDecline={webrtc.declineCall}
      />

      {/* Video Call Dialog */}
      <VideoCallDialog
        open={webrtc.callDialogOpen}
        currentCallTarget={webrtc.currentCallTarget}
        localVideoRef={webrtc.localVideoRef}
        remoteVideoRef={webrtc.remoteVideoRef}
        isMuted={webrtc.isMuted}
        isVideoEnabled={webrtc.isVideoEnabled}
        onToggleMute={webrtc.toggleMute}
        onToggleVideo={webrtc.toggleVideo}
        onEndCall={webrtc.endCall}
        isCallActive={webrtc.isCallActive}
      />
    </Box>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ChatApp />} />
        <Route path="/statistics" element={<Statistics />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/turn-stats" element={<TurnStats />} />
      </Routes>
    </Router>
  );
}

export default App;
