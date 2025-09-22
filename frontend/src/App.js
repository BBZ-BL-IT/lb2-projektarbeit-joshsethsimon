// frontend/src/App.js
import React, { useState, useEffect, useRef } from "react";
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  AppBar,
  Toolbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Alert,
} from "@mui/material";
import {
  VideoCall,
  CallEnd,
  Mic,
  MicOff,
  Videocam,
  VideocamOff,
  Send,
  Refresh,
} from "@mui/icons-material";
import io from "socket.io-client";
import axios from "axios";

// Updated API URLs to work with Caddy proxy
const API_URL = process.env.REACT_APP_API_URL || "";

function App() {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [currentRoom, setCurrentRoom] = useState("general");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);

  // Video Call States
  const [isCallActive, setIsCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [callDialogOpen, setCallDialogOpen] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // WebRTC Configuration
  const pcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (isLoggedIn && username) {
      try {
        const newSocket = io(window.location.origin, {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          path: '/ws/socket.io/',
          forceNew: true,
        });

        newSocket.on('connect', () => {
          console.log('Connected to WebSocket server');
          newSocket.emit("join", { username });
          setError("");
        });

        newSocket.on('connect_error', (err) => {
          console.error('WebSocket connection error:', err);
          setError("Failed to connect to chat server");
        });

        // Handle incoming messages (both events for compatibility)
        newSocket.on("message", (data) => {
          setMessages((prev) => [...prev, data]);
        });

        newSocket.on("new_message", (data) => {
          setMessages((prev) => [...prev, data]);
        });

        // Handle message history
        newSocket.on("message-history", (history) => {
          setMessages(history);
        });

        // Handle users list updates
        newSocket.on("users", (users) => {
          setOnlineUsers(users.filter((u) => u !== username));
        });

        newSocket.on("user_joined", (data) => {
          console.log(`${data.username} joined the chat`);
        });

        newSocket.on("user_left", (data) => {
          console.log(`${data.username} left the chat`);
        });

        // Handle typing indicators
        newSocket.on("user-typing", (data) => {
          setTypingUsers(prev => {
            if (data.isTyping) {
              return prev.includes(data.username) 
                ? prev 
                : [...prev, data.username];
            } else {
              return prev.filter(user => user !== data.username);
            }
          });
        });

        // Video call events
        newSocket.on("call-offer", handleCallOffer);
        newSocket.on("call-answer", handleCallAnswer);
        newSocket.on("ice-candidate", handleIceCandidate);
        newSocket.on("call-end", handleCallEnd);

        // Handle message deletion
        newSocket.on("message-deleted", (data) => {
          setMessages(prev => prev.filter(msg => msg._id !== data.messageId));
        });

        // Handle errors
        newSocket.on("error", (data) => {
          setError(data.message);
        });

        setSocket(newSocket);

        return () => {
          newSocket.disconnect();
        };
      } catch (err) {
        console.error('Failed to initialize WebSocket:', err);
        setError("Failed to initialize chat connection");
      }
    }
  }, [isLoggedIn, username]);

  // Load initial messages when logged in
  useEffect(() => {
    if (isLoggedIn) {
      loadMessages();
      loadOnlineUsers();
    }
  }, [isLoggedIn]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/chat/messages/recent`, {
        params: { limit: 50 }
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
  };

  const loadOnlineUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/chat/users`);
      if (response.data.users) {
        setOnlineUsers(response.data.users.filter(u => u !== username));
      }
    } catch (error) {
      console.error("Failed to load online users:", error);
      // Don't show error for this as it's not critical
    }
  };

  const handleLogin = async () => {
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    if (username.trim().length < 3 || username.trim().length > 20) {
      setError("Username must be between 3 and 20 characters");
      return;
    }

    // Check if username contains only allowed characters
    if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
      setError("Username can only contain letters, numbers, underscores, and hyphens");
      return;
    }

    try {
      setLoading(true);
      setError("");
      
      // Register/update user in the participant service
      await axios.post(`${API_URL}/api/participants`, { 
        username: username.trim() 
      });
      
      setIsLoggedIn(true);
    } catch (error) {
      console.error("Login failed:", error);
      if (error.response?.status === 409) {
        setError("Username already taken. Please choose another.");
      } else {
        setError(error.response?.data?.error || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const messageData = {
      username: username.trim(),
      message: newMessage.trim(),
      room: currentRoom,
    };

    try {
      // Send via WebSocket for real-time delivery
      if (socket && socket.connected) {
        socket.emit("message", {
          ...messageData,
          timestamp: new Date().toISOString(),
        });
        
        setNewMessage("");
        setError("");
      } else {
        // Fallback: send via REST API if WebSocket is not connected
        await axios.post(`${API_URL}/api/chat/messages`, messageData);
        setNewMessage("");
        setError("");
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setError("Failed to send message. Please try again.");
    }

    // Clear typing indicator
    if (socket && socket.connected) {
      socket.emit("typing", { isTyping: false });
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle typing indicator
  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    
    if (socket && socket.connected) {
      socket.emit("typing", { isTyping: true });
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout to stop typing indicator
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("typing", { isTyping: false });
      }, 1000);
    }
  };

  // Video Call Functions (keeping existing implementation)
  const initializeWebRTC = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("WebRTC is not supported by this browser");
      }

      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (videoError) {
        console.warn("Video not available, trying audio only:", videoError);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setIsVideoEnabled(false);
        } catch (audioError) {
          console.warn("Audio not available, trying without media:", audioError);
          stream = new MediaStream();
        }
      }

      localStreamRef.current = stream;
      if (localVideoRef.current && stream.getVideoTracks().length > 0) {
        localVideoRef.current.srcObject = stream;
      }

      const enhancedPcConfig = {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
        iceCandidatePoolSize: 10,
      };

      const peerConnection = new RTCPeerConnection(enhancedPcConfig);
      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("ice-candidate", event.candidate);
        }
      };

      peerConnection.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      peerConnection.onconnectionstatechange = () => {
        console.log("WebRTC Connection State:", peerConnection.connectionState);
        if (peerConnection.connectionState === "failed") {
          console.error("WebRTC connection failed");
        }
      };

      return peerConnection;
    } catch (error) {
      console.error("Error accessing media devices:", error);

      let errorMessage = "Unknown error";

      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        errorMessage = "Camera/microphone permission denied. Please allow in browser settings.";
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        errorMessage = "No camera or microphone found.";
      } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        errorMessage = "Camera/microphone is already being used by another application.";
      } else if (error.name === "NotSupportedError") {
        errorMessage = "WebRTC is not supported. Use HTTPS or a supported browser.";
      }

      setError(`Video call error: ${errorMessage}`);
      throw error;
    }
  };

  const startCall = async (targetUser) => {
    try {
      const peerConnection = await initializeWebRTC();
      if (peerConnection && socket) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit("call-offer", {
          target: targetUser,
          offer: offer,
        });

        setIsCallActive(true);
        setCallDialogOpen(true);
      }
    } catch (error) {
      console.error("Failed to start call:", error);
      setError("Failed to start video call");
    }
  };

  const handleCallOffer = async (data) => {
    setIncomingCall(data);
  };

  const acceptCall = async () => {
    try {
      const peerConnection = await initializeWebRTC();
      if (peerConnection && socket && incomingCall) {
        await peerConnection.setRemoteDescription(incomingCall.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit("call-answer", {
          target: incomingCall.from,
          answer: answer,
        });

        setIsCallActive(true);
        setCallDialogOpen(true);
        setIncomingCall(null);
      }
    } catch (error) {
      console.error("Failed to accept call:", error);
      setError("Failed to accept video call");
    }
  };

  const handleCallAnswer = async (data) => {
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(data.answer);
      }
    } catch (error) {
      console.error("Failed to handle call answer:", error);
    }
  };

  const handleIceCandidate = async (candidate) => {
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(candidate);
      }
    } catch (error) {
      console.error("Failed to handle ICE candidate:", error);
    }
  };

  const endCall = () => {
    if (socket) {
      socket.emit("call-end");
    }
    handleCallEnd();
  };

  const handleCallEnd = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setIsCallActive(false);
    setCallDialogOpen(false);
    setIncomingCall(null);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const refreshData = () => {
    loadMessages();
    loadOnlineUsers();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  if (!isLoggedIn) {
    return (
      <Container maxWidth="sm" style={{ marginTop: "50px" }}>
        <Paper elevation={3} style={{ padding: "30px", textAlign: "center" }}>
          <Typography variant="h4" gutterBottom>
            Chat App MVP
          </Typography>
          {error && (
            <Alert severity="error" style={{ marginBottom: "20px" }}>
              {error}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Username (3-20 characters, letters/numbers/underscore/hyphen only)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleLogin()}
            style={{ marginBottom: "20px" }}
            disabled={loading}
            error={!!error}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleLogin}
            fullWidth
            disabled={loading}
          >
            {loading ? "Joining..." : "Join Chat"}
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <div>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" style={{ flexGrow: 1 }}>
            Chat App - Welcome {username} (Room: {currentRoom})
          </Typography>
          <IconButton color="inherit" onClick={refreshData} title="Refresh">
            <Refresh />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" style={{ marginTop: "20px" }}>
        {error && (
          <Alert 
            severity="error" 
            style={{ marginBottom: "20px" }}
            onClose={() => setError("")}
          >
            {error}
          </Alert>
        )}
        
        <Box display="flex" gap={2}>
          {/* Online Users */}
          <Paper style={{ width: "250px", padding: "15px" }}>
            <Typography variant="h6" gutterBottom>
              Online Users ({onlineUsers.length})
            </Typography>
            <List dense>
              {onlineUsers.map((user, index) => (
                <ListItem key={index}>
                  <ListItemText 
                    primary={user} 
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                  <IconButton
                    color="primary"
                    size="small"
                    onClick={() => startCall(user)}
                    title="Start Video Call"
                  >
                    <VideoCall fontSize="small" />
                  </IconButton>
                </ListItem>
              ))}
              {onlineUsers.length === 0 && (
                <Typography variant="body2" color="textSecondary">
                  No other users online
                </Typography>
              )}
            </List>
          </Paper>

          {/* Chat Area */}
          <Paper style={{ flexGrow: 1, padding: "15px" }}>
            <Box
              height="400px"
              overflow="auto"
              marginBottom="15px"
              border="1px solid #ddd"
              padding="10px"
              bgcolor="#fafafa"
            >
              {loading && (
                <Typography variant="body2" color="textSecondary" align="center">
                  Loading messages...
                </Typography>
              )}
              {messages.map((msg, index) => (
                <Box key={msg._id || index} marginBottom="10px">
                  <Typography variant="subtitle2" color="primary">
                    {msg.username}
                  </Typography>
                  <Typography variant="body2" style={{ wordBreak: "break-word" }}>
                    {msg.message}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </Typography>
                </Box>
              ))}
              
              {/* Typing indicators */}
              {typingUsers.length > 0 && (
                <Box marginBottom="10px">
                  <Typography variant="caption" color="textSecondary" fontStyle="italic">
                    {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
                  </Typography>
                </Box>
              )}
              
              <div ref={messagesEndRef} />
            </Box>

            <Box display="flex" gap={1}>
              <TextField
                fullWidth
                multiline
                maxRows={3}
                placeholder="Type your message... (Press Enter to send)"
                value={newMessage}
                onChange={handleTyping}
                onKeyPress={handleKeyPress}
                disabled={!socket?.connected}
              />
              <Button
                variant="contained"
                color="primary"
                onClick={sendMessage}
                startIcon={<Send />}
                disabled={!newMessage.trim() || !socket?.connected}
              >
                Send
              </Button>
            </Box>
            {!socket?.connected && (
              <Typography variant="caption" color="error" style={{ marginTop: "5px" }}>
                Disconnected from server
              </Typography>
            )}
          </Paper>
        </Box>
      </Container>

      {/* Incoming Call Dialog */}
      <Dialog open={!!incomingCall}>
        <DialogTitle>Incoming Call</DialogTitle>
        <DialogContent>
          <Typography>{incomingCall?.from} is calling you...</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIncomingCall(null)} color="error">
            Decline
          </Button>
          <Button onClick={acceptCall} variant="contained" color="primary">
            Accept
          </Button>
        </DialogActions>
      </Dialog>

      {/* Video Call Dialog */}
      <Dialog
        open={callDialogOpen}
        maxWidth="md"
        fullWidth
        onClose={() => !isCallActive && setCallDialogOpen(false)}
      >
        <DialogTitle>Video Call</DialogTitle>
        <DialogContent>
          <Box display="flex" gap={2} justifyContent="center">
            <Box textAlign="center">
              <Typography variant="subtitle2">You</Typography>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                style={{
                  width: "300px",
                  height: "200px",
                  border: "1px solid #ddd",
                  backgroundColor: "#000",
                }}
              />
            </Box>
            <Box textAlign="center">
              <Typography variant="subtitle2">Remote</Typography>
              <video
                ref={remoteVideoRef}
                autoPlay
                style={{
                  width: "300px",
                  height: "200px",
                  border: "1px solid #ddd",
                  backgroundColor: "#000",
                }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <IconButton
            onClick={toggleMute}
            color={isMuted ? "error" : "primary"}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff /> : <Mic />}
          </IconButton>
          <IconButton
            onClick={toggleVideo}
            color={!isVideoEnabled ? "error" : "primary"}
            title={!isVideoEnabled ? "Enable Video" : "Disable Video"}
          >
            {!isVideoEnabled ? <VideocamOff /> : <Videocam />}
          </IconButton>
          <Button
            onClick={endCall}
            variant="contained"
            color="error"
            startIcon={<CallEnd />}
          >
            End Call
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default App;