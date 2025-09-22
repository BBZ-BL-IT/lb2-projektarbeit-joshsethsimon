// frontend/src/App.js
import React, { useState, useEffect, useRef } from 'react';
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
  IconButton
} from '@mui/material';
import {
  VideoCall,
  CallEnd,
  Mic,
  MicOff,
  Videocam,
  VideocamOff,
  Send
} from '@mui/icons-material';
import io from 'socket.io-client';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5001';

function App() {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  
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

  // WebRTC Configuration
  const pcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    if (isLoggedIn && username) {
      const newSocket = io(WS_URL);
      setSocket(newSocket);

      newSocket.emit('join', { username });

      newSocket.on('message', (data) => {
        setMessages(prev => [...prev, data]);
      });

      newSocket.on('users', (users) => {
        setOnlineUsers(users.filter(u => u !== username));
      });

      // Video call events
      newSocket.on('call-offer', handleCallOffer);
      newSocket.on('call-answer', handleCallAnswer);
      newSocket.on('ice-candidate', handleIceCandidate);
      newSocket.on('call-end', handleCallEnd);

      return () => {
        newSocket.disconnect();
      };
    }
  }, [isLoggedIn, username]);

  const handleLogin = async () => {
    if (username.trim()) {
      try {
        await axios.post(`${API_URL}/auth/login`, { username });
        setIsLoggedIn(true);
      } catch (error) {
        console.error('Login failed:', error);
      }
    }
  };

  const sendMessage = () => {
    if (newMessage.trim() && socket) {
      const messageData = {
        username,
        message: newMessage,
        timestamp: new Date().toISOString()
      };
      socket.emit('message', messageData);
      setNewMessage('');
    }
  };

  // Video Call Functions
  const initializeWebRTC = async () => {
    try {
      // Prüfe erst ob getUserMedia verfügbar ist
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('WebRTC wird von diesem Browser nicht unterstützt');
      }

      // Erweiterte Browser-Kompatibilität
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      };

      // Fallback: Nur Audio wenn Video fehlschlägt
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (videoError) {
        console.warn('Video nicht verfügbar, versuche nur Audio:', videoError);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setIsVideoEnabled(false);
        } catch (audioError) {
          console.warn('Audio nicht verfügbar, versuche ohne Medien:', audioError);
          // Erstelle leeren Stream für reine Chat-Funktionalität
          stream = new MediaStream();
        }
      }
      
      localStreamRef.current = stream;
      if (localVideoRef.current && stream.getVideoTracks().length > 0) {
        localVideoRef.current.srcObject = stream;
      }

      // WebRTC Peer Connection mit erweiterten Ice Servern
      const enhancedPcConfig = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      };

      const peerConnection = new RTCPeerConnection(enhancedPcConfig);
      peerConnectionRef.current = peerConnection;

      // Tracks hinzufügen (falls vorhanden)
      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('ice-candidate', event.candidate);
        }
      };

      peerConnection.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Connection State Monitoring
      peerConnection.onconnectionstatechange = () => {
        console.log('WebRTC Connection State:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
          console.error('WebRTC Verbindung fehlgeschlagen');
        }
      };

      return peerConnection;
    } catch (error) {
      console.error('Fehler beim Zugriff auf Mediengeräte:', error);
      
      // Benutzerfreundliche Fehlermeldung
      let errorMessage = 'Unbekannter Fehler';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Kamera/Mikrofon-Berechtigung verweigert. Bitte in den Browser-Einstellungen erlauben.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = 'Keine Kamera oder Mikrofon gefunden.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = 'Kamera/Mikrofon wird bereits von einer anderen Anwendung verwendet.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'WebRTC wird nicht unterstützt. Verwende HTTPS oder einen unterstützten Browser.';
      }
      
      alert(`Video-Call Fehler: ${errorMessage}`);
      throw error;
    }
  };

  const startCall = async (targetUser) => {
    const peerConnection = await initializeWebRTC();
    if (peerConnection && socket) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      socket.emit('call-offer', {
        target: targetUser,
        offer: offer
      });
      
      setIsCallActive(true);
      setCallDialogOpen(true);
    }
  };

  const handleCallOffer = async (data) => {
    setIncomingCall(data);
  };

  const acceptCall = async () => {
    const peerConnection = await initializeWebRTC();
    if (peerConnection && socket && incomingCall) {
      await peerConnection.setRemoteDescription(incomingCall.offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      socket.emit('call-answer', {
        target: incomingCall.from,
        answer: answer
      });
      
      setIsCallActive(true);
      setCallDialogOpen(true);
      setIncomingCall(null);
    }
  };

  const handleCallAnswer = async (data) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(data.answer);
    }
  };

  const handleIceCandidate = async (candidate) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.addIceCandidate(candidate);
    }
  };

  const endCall = () => {
    if (socket) {
      socket.emit('call-end');
    }
    handleCallEnd();
  };

  const handleCallEnd = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
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

  if (!isLoggedIn) {
    return (
      <Container maxWidth="sm" style={{ marginTop: '50px' }}>
        <Paper elevation={3} style={{ padding: '30px', textAlign: 'center' }}>
          <Typography variant="h4" gutterBottom>
            Chat App MVP
          </Typography>
          <TextField
            fullWidth
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            style={{ marginBottom: '20px' }}
          />
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleLogin}
            fullWidth
          >
            Join Chat
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
            Chat App - Welcome {username}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" style={{ marginTop: '20px' }}>
        <Box display="flex" gap={2}>
          {/* Online Users */}
          <Paper style={{ width: '250px', padding: '15px' }}>
            <Typography variant="h6" gutterBottom>
              Online Users ({onlineUsers.length})
            </Typography>
            <List>
              {onlineUsers.map((user, index) => (
                <ListItem key={index}>
                  <ListItemText primary={user} />
                  <IconButton
                    color="primary"
                    onClick={() => startCall(user)}
                    title="Start Video Call"
                  >
                    <VideoCall />
                  </IconButton>
                </ListItem>
              ))}
            </List>
          </Paper>

          {/* Chat Area */}
          <Paper style={{ flexGrow: 1, padding: '15px' }}>
            <Box height="400px" overflow="auto" marginBottom="15px" border="1px solid #ddd" padding="10px">
              {messages.map((msg, index) => (
                <Box key={index} marginBottom="10px">
                  <Typography variant="subtitle2" color="primary">
                    {msg.username}
                  </Typography>
                  <Typography variant="body2">
                    {msg.message}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </Typography>
                </Box>
              ))}
            </Box>
            
            <Box display="flex" gap={1}>
              <TextField
                fullWidth
                placeholder="Type your message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              />
              <Button
                variant="contained"
                color="primary"
                onClick={sendMessage}
                startIcon={<Send />}
              >
                Send
              </Button>
            </Box>
          </Paper>
        </Box>
      </Container>

      {/* Incoming Call Dialog */}
      <Dialog open={!!incomingCall}>
        <DialogTitle>Incoming Call</DialogTitle>
        <DialogContent>
          <Typography>
            {incomingCall?.from} is calling you...
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIncomingCall(null)}>
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
                style={{ width: '300px', height: '200px', border: '1px solid #ddd' }}
              />
            </Box>
            <Box textAlign="center">
              <Typography variant="subtitle2">Remote</Typography>
              <video
                ref={remoteVideoRef}
                autoPlay
                style={{ width: '300px', height: '200px', border: '1px solid #ddd' }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <IconButton onClick={toggleMute} color={isMuted ? 'error' : 'primary'}>
            {isMuted ? <MicOff /> : <Mic />}
          </IconButton>
          <IconButton onClick={toggleVideo} color={!isVideoEnabled ? 'error' : 'primary'}>
            {!isVideoEnabled ? <VideocamOff /> : <Videocam />}
          </IconButton>
          <Button onClick={endCall} variant="contained" color="error" startIcon={<CallEnd />}>
            End Call
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default App;