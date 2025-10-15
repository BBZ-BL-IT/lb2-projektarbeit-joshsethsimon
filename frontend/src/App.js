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
  Chip,
  Tooltip,
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
  BarChart,
  Logout,
  Menu,
  Close,
  History,
  CheckCircle,
  Warning,
} from "@mui/icons-material";
import io from "socket.io-client";
import axios from "axios";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useNavigate,
} from "react-router-dom";
import Statistics from "./Statistics";
import Logs from "./Logs";
import { getWebRTCConfig, isTurnServiceAvailable } from "./utils/webrtc-helper";

const API_URL = process.env.REACT_APP_API_URL || "";

function ChatApp() {
  const navigate = useNavigate();
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
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isUsersPanelOpen, setIsUsersPanelOpen] = useState(true);
  const [turnServiceAvailable, setTurnServiceAvailable] = useState(false);

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

  // Check for stored credentials on component mount
  useEffect(() => {
    const checkStoredAuth = async () => {
      const storedUsername = localStorage.getItem("chatUsername");

      if (storedUsername) {
        try {
          // Verify the user still exists and reactivate them
          await axios.post(`${API_URL}/api/participants/join`, {
            username: storedUsername,
          });

          setUsername(storedUsername);
          setIsLoggedIn(true);
          setError("");
        } catch (error) {
          console.error("Stored login failed:", error);
          // Clear invalid stored credentials
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
    // Check every 30 seconds
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

        newSocket.on("call-offer", handleCallOffer);
        newSocket.on("call-answer", handleCallAnswer);
        newSocket.on("ice-candidate", handleIceCandidate);
        newSocket.on("call-end", handleCallEnd);

        newSocket.on("message-deleted", (data) => {
          setMessages((prev) =>
            prev.filter((msg) => msg._id !== data.messageId),
          );
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
  };

  const loadOnlineUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/chat/users`);
      if (response.data.users) {
        setOnlineUsers(response.data.users.filter((u) => u !== username));
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

      // Store credentials in localStorage
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

    // Clear stored credentials
    localStorage.removeItem("chatUsername");

    // Disconnect socket
    if (socket) {
      socket.disconnect();
    }

    // Reset state
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
      hasLocalVideoRef: !!localVideoRef.current,
    });

    if (callDialogOpen && localStreamRef.current && localVideoRef.current) {
      console.log("Attaching local stream to video element");
      console.log(
        "Local stream tracks:",
        localStreamRef.current.getTracks().map((t) => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
        })),
      );

      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.onloadedmetadata = () => {
        console.log("Local video metadata loaded");
        localVideoRef.current
          .play()
          .then(() => console.log("Local video playing"))
          .catch((e) => console.error("Local video play error:", e));
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
        console.log(
          "Stream tracks:",
          stream.getTracks().map((t) => ({
            kind: t.kind,
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState,
          })),
        );
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
          localVideoRef.current
            .play()
            .then(() => console.log("Local video playing from initWebRTC"))
            .catch((e) => console.error("Local video play error:", e));
        };
      } else {
        console.log(
          "Local video ref DOES NOT exist yet, will attach in useEffect",
        );
      }

      // Fetch STUN/TURN configuration from the backend
      console.log("Fetching STUN/TURN configuration...");
      const pcConfig = await getWebRTCConfig();
      console.log("Using WebRTC configuration:", pcConfig);

      const peerConnection = new RTCPeerConnection(pcConfig);
      peerConnectionRef.current = peerConnection;
      console.log("Created peer connection");

      // Add tracks to peer connection
      stream.getTracks().forEach((track) => {
        console.log(
          `Adding ${track.kind} track (${track.label}) to peer connection`,
        );
        const sender = peerConnection.addTrack(track, stream);
        console.log("Track added, sender:", sender.track?.kind);
      });

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket && currentCallTarget) {
          console.log("Sending ICE candidate to", currentCallTarget);
          socket.emit("ice-candidate", {
            target: currentCallTarget,
            candidate: event.candidate,
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
          console.log(
            "Remote stream tracks:",
            remoteStream.getTracks().map((t) => ({
              kind: t.kind,
              enabled: t.enabled,
              readyState: t.readyState,
            })),
          );

          // Set remote stream
          if (remoteVideoRef.current) {
            console.log("Setting remote video srcObject");
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.onloadedmetadata = () => {
              console.log("Remote video metadata loaded, attempting play");
              remoteVideoRef.current
                .play()
                .then(() => console.log("Remote video playing successfully"))
                .catch((e) => console.error("Remote video play error:", e));
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

      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        errorMessage =
          "Camera/microphone permission denied. Please allow in browser settings.";
      } else if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        errorMessage = "No camera or microphone found.";
      } else if (
        error.name === "NotReadableError" ||
        error.name === "TrackStartError"
      ) {
        errorMessage =
          "Camera/microphone is already being used by another application.";
      } else if (error.name === "NotSupportedError") {
        errorMessage =
          "WebRTC is not supported. Use HTTPS or a supported browser.";
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
      await new Promise((resolve) => setTimeout(resolve, 300));

      console.log("Checking video refs after dialog open:");
      console.log("- localVideoRef.current exists:", !!localVideoRef.current);
      console.log("- remoteVideoRef.current exists:", !!remoteVideoRef.current);

      const peerConnection = await initializeWebRTC();

      if (peerConnection && socket) {
        console.log("Creating offer...");
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await peerConnection.setLocalDescription(offer);

        console.log("Offer created, sending to", targetUser);
        console.log("Offer has video:", offer.sdp.includes("m=video"));
        console.log("Offer has audio:", offer.sdp.includes("m=audio"));

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
      await new Promise((resolve) => setTimeout(resolve, 300));

      console.log("Checking video refs after dialog open:");
      console.log("- localVideoRef.current exists:", !!localVideoRef.current);
      console.log("- remoteVideoRef.current exists:", !!remoteVideoRef.current);

      const peerConnection = await initializeWebRTC();

      if (peerConnection && socket && callData) {
        console.log("Setting remote description from offer...");
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(callData.offer),
        );
        console.log("Remote description set");

        console.log("Creating answer...");
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        console.log("Answer created, sending to", callData.from);
        console.log("Answer has video:", answer.sdp.includes("m=video"));
        console.log("Answer has audio:", answer.sdp.includes("m=audio"));

        socket.emit("call-answer", {
          target: callData.from,
          answer: answer,
        });
        console.log("=== CALL ANSWER SENT ===");

        // Process pending ICE candidates
        if (pendingIceCandidatesRef.current.length > 0) {
          console.log(
            "Processing",
            pendingIceCandidatesRef.current.length,
            "pending ICE candidates",
          );
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
          new RTCSessionDescription(data.answer),
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

      if (
        peerConnectionRef.current &&
        peerConnectionRef.current.remoteDescription
      ) {
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
        localStreamRef.current.getTracks().forEach((track) => track.stop());
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
        <Paper elevation={3} style={{ padding: "30px" }}>
          <Typography variant="h5" gutterBottom>
            Loading...
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Checking authentication
          </Typography>
        </Paper>
      </Container>
    );
  }

  if (!isLoggedIn) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          padding: "20px",
        }}
      >
        <Container maxWidth="sm">
          <Paper
            elevation={6}
            sx={{
              padding: "40px",
              borderRadius: "16px",
              textAlign: "center",
              backdropFilter: "blur(10px)",
              background: "rgba(255, 255, 255, 0.95)",
            }}
          >
            <Typography
              variant="h3"
              gutterBottom
              sx={{
                fontWeight: 700,
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                marginBottom: "10px",
              }}
            >
              Chat App
            </Typography>
            <Typography
              variant="subtitle1"
              color="text.secondary"
              sx={{ marginBottom: "30px" }}
            >
              Connect and communicate instantly
            </Typography>
            {error && (
              <Alert
                severity="error"
                sx={{ marginBottom: "24px", borderRadius: "8px" }}
              >
                {error}
              </Alert>
            )}
            <TextField
              fullWidth
              label="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleLogin()}
              sx={{
                marginBottom: "24px",
                "& .MuiOutlinedInput-root": {
                  borderRadius: "12px",
                },
              }}
              disabled={loading}
              error={!!error}
              helperText="3-20 characters, letters/numbers/underscore/hyphen only"
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
                marginBottom: "16px",
                textAlign: "center",
              }}
            >
              💡 Your username will be saved for next time
            </Typography>
            <Button
              variant="contained"
              onClick={handleLogin}
              fullWidth
              disabled={loading}
              sx={{
                padding: "12px",
                borderRadius: "12px",
                fontSize: "16px",
                fontWeight: 600,
                textTransform: "none",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                boxShadow: "0 4px 15px rgba(102, 126, 234, 0.4)",
                "&:hover": {
                  background:
                    "linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)",
                  boxShadow: "0 6px 20px rgba(102, 126, 234, 0.6)",
                },
              }}
            >
              {loading ? "Joining..." : "Join Chat"}
            </Button>
          </Paper>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f7fa" }}>
      <AppBar
        position="static"
        elevation={0}
        sx={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            💬 Chat App - Welcome, {username}
          </Typography>
          <Tooltip
            title={
              turnServiceAvailable
                ? "STUN/TURN server active - Enhanced WebRTC connectivity"
                : "Using fallback public STUN servers"
            }
            arrow
          >
            <Chip
              icon={turnServiceAvailable ? <CheckCircle /> : <Warning />}
              label={turnServiceAvailable ? "TURN Active" : "Fallback STUN"}
              size="small"
              color={turnServiceAvailable ? "success" : "warning"}
              sx={{
                marginRight: 2,
                fontWeight: 500,
                "& .MuiChip-icon": {
                  color: "inherit",
                },
              }}
            />
          </Tooltip>
          <IconButton
            color="inherit"
            onClick={() => navigate("/statistics")}
            title="View Statistics"
            sx={{
              "&:hover": {
                background: "rgba(255, 255, 255, 0.1)",
              },
            }}
          >
            <BarChart />
          </IconButton>
          <IconButton
            color="inherit"
            onClick={() => navigate("/logs")}
            title="View Logs"
            sx={{
              "&:hover": {
                background: "rgba(255, 255, 255, 0.1)",
              },
            }}
          >
            <History />
          </IconButton>
          <IconButton
            color="inherit"
            onClick={refreshData}
            title="Refresh"
            sx={{
              "&:hover": {
                background: "rgba(255, 255, 255, 0.1)",
              },
            }}
          >
            <Refresh />
          </IconButton>
          <IconButton
            color="inherit"
            onClick={handleLogout}
            title="Logout"
            sx={{
              "&:hover": {
                background: "rgba(255, 255, 255, 0.1)",
              },
            }}
          >
            <Logout />
          </IconButton>
        </Toolbar>
      </AppBar>

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
            <Paper
              elevation={2}
              sx={{
                width: "280px",
                padding: "20px",
                borderRadius: "16px",
                background: "white",
                boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                position: "relative",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    color: "#667eea",
                  }}
                >
                  🟢 Online Users ({onlineUsers.length})
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setIsUsersPanelOpen(false)}
                  sx={{
                    color: "#667eea",
                    "&:hover": {
                      backgroundColor: "rgba(102, 126, 234, 0.1)",
                    },
                  }}
                >
                  <Close />
                </IconButton>
              </Box>
              <List dense>
                {onlineUsers.map((user, index) => (
                  <ListItem
                    key={index}
                    sx={{
                      borderRadius: "8px",
                      marginBottom: "8px",
                      "&:hover": {
                        background: "#f5f7fa",
                      },
                    }}
                  >
                    <ListItemText
                      primary={user}
                      primaryTypographyProps={{
                        variant: "body2",
                        fontWeight: 500,
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => startCall(user)}
                      title="Start Video Call"
                      sx={{
                        color: "#667eea",
                        "&:hover": {
                          background: "rgba(102, 126, 234, 0.1)",
                        },
                      }}
                    >
                      <VideoCall fontSize="small" />
                    </IconButton>
                  </ListItem>
                ))}
                {onlineUsers.length === 0 && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textAlign: "center", padding: "20px" }}
                  >
                    No other users online
                  </Typography>
                )}
              </List>
            </Paper>
          )}

          {/* Chat Panel */}
          <Paper
            elevation={2}
            sx={{
              flexGrow: 1,
              padding: "20px",
              borderRadius: "16px",
              background: "white",
              boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box
              sx={{
                height: "500px",
                overflow: "auto",
                marginBottom: "20px",
                padding: "16px",
                borderRadius: "12px",
                bgcolor: "#f8f9fa",
                border: "1px solid #e9ecef",
                "&::-webkit-scrollbar": {
                  width: "8px",
                },
                "&::-webkit-scrollbar-track": {
                  background: "#f1f1f1",
                  borderRadius: "10px",
                },
                "&::-webkit-scrollbar-thumb": {
                  background: "#888",
                  borderRadius: "10px",
                  "&:hover": {
                    background: "#555",
                  },
                },
              }}
            >
              {loading && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  align="center"
                  sx={{ padding: "20px" }}
                >
                  Loading messages...
                </Typography>
              )}
              {messages.map((msg, index) => (
                <Box
                  key={msg._id || index}
                  sx={{
                    marginBottom: "16px",
                    padding: "12px",
                    borderRadius: "12px",
                    background: msg.username === username ? "#e3f2fd" : "white",
                    border: "1px solid",
                    borderColor:
                      msg.username === username ? "#90caf9" : "#e0e0e0",
                    maxWidth: "70%",
                    marginLeft: msg.username === username ? "auto" : "0",
                    marginRight: msg.username === username ? "0" : "auto",
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      color: "#667eea",
                      fontWeight: 600,
                      marginBottom: "4px",
                    }}
                  >
                    {msg.username}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      wordBreak: "break-word",
                      color: "#2c3e50",
                      lineHeight: 1.5,
                    }}
                  >
                    {msg.message}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#95a5a6",
                      display: "block",
                      marginTop: "4px",
                    }}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </Typography>
                </Box>
              ))}

              {typingUsers.length > 0 && (
                <Box sx={{ marginBottom: "10px", paddingLeft: "12px" }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#95a5a6",
                      fontStyle: "italic",
                    }}
                  >
                    {typingUsers.join(", ")}{" "}
                    {typingUsers.length === 1 ? "is" : "are"} typing...
                  </Typography>
                </Box>
              )}

              <div ref={messagesEndRef} />
            </Box>

            <Box display="flex" gap={2}>
              <TextField
                fullWidth
                multiline
                maxRows={3}
                placeholder="Type your message..."
                value={newMessage}
                onChange={handleTyping}
                onKeyPress={handleKeyPress}
                disabled={!socket?.connected}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "12px",
                    background: "#f8f9fa",
                  },
                }}
              />
              <Button
                variant="contained"
                onClick={sendMessage}
                disabled={!newMessage.trim() || !socket?.connected}
                sx={{
                  borderRadius: "12px",
                  minWidth: "100px",
                  textTransform: "none",
                  fontWeight: 600,
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  boxShadow: "0 4px 15px rgba(102, 126, 234, 0.4)",
                  "&:hover": {
                    background:
                      "linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)",
                    boxShadow: "0 6px 20px rgba(102, 126, 234, 0.6)",
                  },
                }}
                startIcon={<Send />}
              >
                Send
              </Button>
            </Box>
            {!socket?.connected && (
              <Typography
                variant="caption"
                color="error"
                sx={{ marginTop: "8px", textAlign: "center" }}
              >
                ⚠️ Disconnected from server
              </Typography>
            )}
          </Paper>
        </Box>
      </Container>

      <Dialog
        open={!!incomingCall}
        PaperProps={{
          sx: {
            borderRadius: "16px",
            padding: "8px",
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, color: "#667eea" }}>
          📞 Incoming Call
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: "16px", color: "#2c3e50" }}>
            <strong>{incomingCall?.from}</strong> is calling you...
          </Typography>
        </DialogContent>
        <DialogActions sx={{ padding: "16px" }}>
          <Button
            onClick={declineCall}
            sx={{
              borderRadius: "8px",
              textTransform: "none",
              fontWeight: 600,
              color: "#e74c3c",
              "&:hover": {
                background: "rgba(231, 76, 60, 0.1)",
              },
            }}
          >
            Decline
          </Button>
          <Button
            onClick={acceptCall}
            variant="contained"
            sx={{
              borderRadius: "8px",
              textTransform: "none",
              fontWeight: 600,
              background: "linear-gradient(135deg, #27ae60 0%, #229954 100%)",
              boxShadow: "0 4px 15px rgba(39, 174, 96, 0.4)",
              "&:hover": {
                background: "linear-gradient(135deg, #229954 0%, #1e8449 100%)",
              },
            }}
          >
            Accept
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={callDialogOpen}
        maxWidth="md"
        fullWidth
        onClose={() => !isCallActive && setCallDialogOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: "16px",
            background: "#1a1a1a",
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 600,
            color: "white",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          }}
        >
          🎥 Video Call {currentCallTarget && `with ${currentCallTarget}`}
        </DialogTitle>
        <DialogContent sx={{ background: "#1a1a1a", padding: "24px" }}>
          <Box display="flex" gap={3} justifyContent="center" flexWrap="wrap">
            <Box textAlign="center">
              <Typography
                variant="subtitle2"
                sx={{
                  color: "white",
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                You
              </Typography>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "320px",
                  height: "240px",
                  border: "2px solid #667eea",
                  borderRadius: "12px",
                  backgroundColor: "#000",
                  objectFit: "cover",
                }}
              />
            </Box>
            <Box textAlign="center">
              <Typography
                variant="subtitle2"
                sx={{
                  color: "white",
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                {currentCallTarget || "Remote"}
              </Typography>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                style={{
                  width: "320px",
                  height: "240px",
                  border: "2px solid #667eea",
                  borderRadius: "12px",
                  backgroundColor: "#000",
                  objectFit: "cover",
                }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions
          sx={{
            background: "#1a1a1a",
            padding: "16px",
            justifyContent: "center",
            gap: 1,
          }}
        >
          <IconButton
            onClick={toggleMute}
            sx={{
              color: isMuted ? "#e74c3c" : "white",
              background: isMuted
                ? "rgba(231, 76, 60, 0.2)"
                : "rgba(255,255,255,0.1)",
              "&:hover": {
                background: isMuted
                  ? "rgba(231, 76, 60, 0.3)"
                  : "rgba(255,255,255,0.2)",
              },
            }}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff /> : <Mic />}
          </IconButton>
          <IconButton
            onClick={toggleVideo}
            sx={{
              color: !isVideoEnabled ? "#e74c3c" : "white",
              background: !isVideoEnabled
                ? "rgba(231, 76, 60, 0.2)"
                : "rgba(255,255,255,0.1)",
              "&:hover": {
                background: !isVideoEnabled
                  ? "rgba(231, 76, 60, 0.3)"
                  : "rgba(255,255,255,0.2)",
              },
            }}
            title={!isVideoEnabled ? "Enable Video" : "Disable Video"}
          >
            {!isVideoEnabled ? <VideocamOff /> : <Videocam />}
          </IconButton>
          <Button
            onClick={endCall}
            variant="contained"
            startIcon={<CallEnd />}
            sx={{
              borderRadius: "8px",
              textTransform: "none",
              fontWeight: 600,
              background: "#e74c3c",
              marginLeft: "8px",
              "&:hover": {
                background: "#c0392b",
              },
            }}
          >
            End Call
          </Button>
        </DialogActions>
      </Dialog>
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
      </Routes>
    </Router>
  );
}

export default App;
