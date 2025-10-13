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
  const [currentCallTarget, setCurrentCallTarget] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);

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

        newSocket.on("call-offer", handleCallOffer);
        newSocket.on("call-answer", handleCallAnswer);
        newSocket.on("ice-candidate", handleIceCandidate);
        newSocket.on("call-end", handleCallEnd);

        newSocket.on("message-deleted", (data) => {
          setMessages(prev => prev.filter(msg => msg._id !== data.messageId));
        });

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

    if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
      setError("Username can only contain letters, numbers, underscores, and hyphens");
      return;
    }

    try {
      setLoading(true);
      setError("");
      
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

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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

  // Effect to attach local stream to video element when dialog opens
  useEffect(() => {
    console.log("Dialog open effect:", { 
      callDialogOpen, 
      hasLocalStream: !!localStreamRef.current, 
      hasLocalVideoRef: !!localVideoRef.current 
    });
    
    if (callDialogOpen && localStreamRef.current && localVideoRef.current) {
      console.log("Attaching local stream to video element");
      console.log("Local stream tracks:", localStreamRef.current.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState
      })));
      
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.onloadedmetadata = () => {
        console.log("Local video metadata loaded");
        localVideoRef.current.play()
          .then(() => console.log("Local video playing"))
          .catch(e => console.error("Local video play error:", e));
      };
    }
  }, [callDialogOpen]);

  const initializeWebRTC = async () => {
    try {
      console.log("=== INITIALIZING WEBRTC ===");
      
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

      console.log("Requesting media with constraints:", constraints);
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("Got media stream:", stream.id);
        console.log("Stream tracks:", stream.getTracks().map(t => ({
          kind: t.kind,
          label: t.label,
          enabled: t.enabled,
          readyState: t.readyState
        })));
      } catch (videoError) {
        console.warn("Video not available, trying audio only:", videoError);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setIsVideoEnabled(false);
        } catch (audioError) {
          console.warn("Audio not available:", audioError);
          throw new Error("No media devices available");
        }
      }

      localStreamRef.current = stream;
      console.log("Stored stream in localStreamRef");
      
      // If video element already exists, attach stream immediately
      if (localVideoRef.current) {
        console.log("Local video ref exists, attaching stream NOW");
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.onloadedmetadata = () => {
          console.log("Local video metadata loaded in initWebRTC");
          localVideoRef.current.play()
            .then(() => console.log("Local video playing from initWebRTC"))
            .catch(e => console.error("Local video play error:", e));
        };
      } else {
        console.log("Local video ref DOES NOT exist yet, will attach in useEffect");
      }

      const pcConfig = {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
        iceCandidatePoolSize: 10,
      };

      const peerConnection = new RTCPeerConnection(pcConfig);
      peerConnectionRef.current = peerConnection;
      console.log("Created peer connection");

      // Add tracks to peer connection
      stream.getTracks().forEach((track) => {
        console.log(`Adding ${track.kind} track (${track.label}) to peer connection`);
        const sender = peerConnection.addTrack(track, stream);
        console.log("Track added, sender:", sender.track?.kind);
      });

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket && currentCallTarget) {
          console.log("Sending ICE candidate to", currentCallTarget);
          socket.emit("ice-candidate", {
            target: currentCallTarget,
            candidate: event.candidate
          });
        } else if (!event.candidate) {
          console.log("ICE gathering complete");
        }
      };

      // Handle incoming tracks
      peerConnection.ontrack = (event) => {
        console.log("=== RECEIVED REMOTE TRACK ===");
        console.log("Track kind:", event.track.kind);
        console.log("Track state:", event.track.readyState);
        console.log("Number of streams:", event.streams?.length);
        
        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];
          console.log("Remote stream ID:", remoteStream.id);
          console.log("Remote stream tracks:", remoteStream.getTracks().map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState
          })));
          
          // Set remote stream
          if (remoteVideoRef.current) {
            console.log("Setting remote video srcObject");
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.onloadedmetadata = () => {
              console.log("Remote video metadata loaded, attempting play");
              remoteVideoRef.current.play()
                .then(() => console.log("Remote video playing successfully"))
                .catch(e => console.error("Remote video play error:", e));
            };
          } else {
            console.error("Remote video ref is NULL!");
          }
        } else {
          console.error("No streams in track event!");
        }
      };

      peerConnection.onconnectionstatechange = () => {
        console.log("Connection State:", peerConnection.connectionState);
        if (peerConnection.connectionState === "failed") {
          setError("Connection failed. Please try again.");
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", peerConnection.iceConnectionState);
      };

      console.log("=== WEBRTC INITIALIZED ===");
      return peerConnection;
    } catch (error) {
      console.error("Error in initializeWebRTC:", error);

      let errorMessage = "Unknown error";

      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        errorMessage = "Camera/microphone permission denied. Please allow in browser settings.";
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        errorMessage = "No camera or microphone found.";
      } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        errorMessage = "Camera/microphone is already being used by another application.";
      } else if (error.name === "NotSupportedError") {
        errorMessage = "WebRTC is not supported. Use HTTPS or a supported browser.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      setError(`Video call error: ${errorMessage}`);
      throw error;
    }
  };

  const startCall = async (targetUser) => {
    try {
      console.log("=== START CALL INITIATED ===");
      console.log("Target user:", targetUser);
      
      setCurrentCallTarget(targetUser);
      setIsCallActive(true);
      setCallDialogOpen(true);
      
      console.log("Dialog opened, waiting for render...");
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log("Checking video refs after dialog open:");
      console.log("- localVideoRef.current exists:", !!localVideoRef.current);
      console.log("- remoteVideoRef.current exists:", !!remoteVideoRef.current);
      
      const peerConnection = await initializeWebRTC();
      
      if (peerConnection && socket) {
        console.log("Creating offer...");
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);

        console.log("Offer created, sending to", targetUser);
        console.log("Offer has video:", offer.sdp.includes('m=video'));
        console.log("Offer has audio:", offer.sdp.includes('m=audio'));
        
        socket.emit("call-offer", {
          target: targetUser,
          offer: offer,
        });
        console.log("=== CALL OFFER SENT ===");
      }
    } catch (error) {
      console.error("Failed to start call:", error);
      setError("Failed to start video call: " + error.message);
      handleCallEnd();
    }
  };

  const handleCallOffer = async (data) => {
    console.log("Received call offer from", data.from);
    setIncomingCall(data);
    setCurrentCallTarget(data.from);
  };

  const acceptCall = async () => {
    try {
      console.log("=== ACCEPT CALL INITIATED ===");
      console.log("Accepting call from", incomingCall.from);
      
      const callData = incomingCall;
      setIncomingCall(null);
      setIsCallActive(true);
      setCallDialogOpen(true);
      
      console.log("Dialog opened, waiting for render...");
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log("Checking video refs after dialog open:");
      console.log("- localVideoRef.current exists:", !!localVideoRef.current);
      console.log("- remoteVideoRef.current exists:", !!remoteVideoRef.current);
      
      const peerConnection = await initializeWebRTC();
      
      if (peerConnection && socket && callData) {
        console.log("Setting remote description from offer...");
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(callData.offer)
        );
        console.log("Remote description set");
        
        console.log("Creating answer...");
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        console.log("Answer created, sending to", callData.from);
        console.log("Answer has video:", answer.sdp.includes('m=video'));
        console.log("Answer has audio:", answer.sdp.includes('m=audio'));
        
        socket.emit("call-answer", {
          target: callData.from,
          answer: answer,
        });
        console.log("=== CALL ANSWER SENT ===");

        // Process pending ICE candidates
        if (pendingIceCandidatesRef.current.length > 0) {
          console.log("Processing", pendingIceCandidatesRef.current.length, "pending ICE candidates");
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await peerConnection.addIceCandidate(candidate);
            } catch (e) {
              console.warn("Error adding queued ICE candidate:", e);
            }
          }
          pendingIceCandidatesRef.current = [];
        }
      }
    } catch (error) {
      console.error("Failed to accept call:", error);
      setError("Failed to accept video call: " + error.message);
      handleCallEnd();
    }
  };

  const declineCall = () => {
    if (socket && incomingCall) {
      socket.emit("call-end", { target: incomingCall.from });
    }
    setIncomingCall(null);
    setCurrentCallTarget(null);
  };

  const handleCallAnswer = async (data) => {
    try {
      console.log("Received call answer from", data.from);
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        
        // Process pending ICE candidates
        if (pendingIceCandidatesRef.current.length > 0) {
          console.log("Processing pending ICE candidates");
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await peerConnectionRef.current.addIceCandidate(candidate);
            } catch (e) {
              console.warn("Error adding queued ICE candidate:", e);
            }
          }
          pendingIceCandidatesRef.current = [];
        }
      }
    } catch (error) {
      console.error("Failed to handle call answer:", error);
    }
  };

  const handleIceCandidate = async (data) => {
    try {
      console.log("Received ICE candidate");
      const candidate = data.candidate;
      
      if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
        await peerConnectionRef.current.addIceCandidate(candidate);
      } else {
        console.log("Queuing ICE candidate");
        pendingIceCandidatesRef.current.push(candidate);
      }
    } catch (error) {
      console.error("Failed to handle ICE candidate:", error);
    }
  };

  const endCall = () => {
    if (socket && currentCallTarget) {
      socket.emit("call-end", { target: currentCallTarget });
    }
    handleCallEnd();
  };

  const handleCallEnd = () => {
    console.log("Ending call");
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setIsCallActive(false);
    setCallDialogOpen(false);
    setIncomingCall(null);
    setCurrentCallTarget(null);
    setIsMuted(false);
    setIsVideoEnabled(true);
    pendingIceCandidatesRef.current = [];
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

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
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

      <Dialog open={!!incomingCall}>
        <DialogTitle>Incoming Call</DialogTitle>
        <DialogContent>
          <Typography>{incomingCall?.from} is calling you...</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={declineCall} color="error">
            Decline
          </Button>
          <Button onClick={acceptCall} variant="contained" color="primary">
            Accept
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={callDialogOpen}
        maxWidth="md"
        fullWidth
        onClose={() => !isCallActive && setCallDialogOpen(false)}
      >
        <DialogTitle>Video Call {currentCallTarget && `with ${currentCallTarget}`}</DialogTitle>
        <DialogContent>
          <Box display="flex" gap={2} justifyContent="center">
            <Box textAlign="center">
              <Typography variant="subtitle2">You</Typography>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
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
                playsInline
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