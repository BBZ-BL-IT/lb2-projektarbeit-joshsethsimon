import { useRef, useState, useEffect, useCallback } from "react";
import Peer from "simple-peer";
import { isTurnServiceAvailable } from "../utils/webrtc-helper";

/**
 * useWebRTC - Custom hook for WebRTC video calling using Simple-Peer
 * 
 * Simple-Peer handles all the complex WebRTC logic:
 * - Peer connection setup
 * - ICE candidate gathering
 * - Offer/Answer SDP exchange
 * - Media stream management
 */
export function useWebRTC(socket) {
  // Call state
  const [isCallActive, setIsCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [currentCallTarget, setCurrentCallTarget] = useState(null);
  const [connectionState, setConnectionState] = useState("disconnected"); // disconnected, connecting, connected, failed

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);

  // Attach local stream to video element when available
  useEffect(() => {
    if (localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [localStreamRef.current, callDialogOpen]);

  /**
   * Get STUN/TURN configuration
   */
  const getIceServers = useCallback(async () => {
    // Check if forced to use Google STUN (via localStorage or env var)
    const forceGoogleStun = localStorage.getItem('forceGoogleStun') === 'true' || 
                            process.env.REACT_APP_FORCE_GOOGLE_STUN === 'true';
    
    if (forceGoogleStun) {
      console.log('🌐 Forcing Google STUN servers');
      return {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" }
        ]
      };
    }

    try {
      const hasTurn = await isTurnServiceAvailable();
      
      if (hasTurn) {
        console.log('🔄 Using custom TURN server');
        // Use your TURN server
        return {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
              urls: "turn:app.lab.joku.dev:3478",
              username: "user",
              credential: "pass"
            }
          ]
        };
      }
    } catch (error) {
      console.warn("Error checking TURN service:", error);
    }

    // Fallback to public STUN servers
    console.log('📡 Using fallback Google STUN servers');
    return {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
      ]
    };
  }, []);

  /**
   * Get user media (camera and microphone)
   */
  const getUserMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      return stream;
    } catch (error) {
      console.error("Error getting user media:", error);
      
      // Try audio-only if video fails
      if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
          });
          
          localStreamRef.current = audioStream;
          setIsVideoEnabled(false);
          return audioStream;
        } catch (audioError) {
          throw new Error("No camera or microphone available");
        }
      }
      
      throw error;
    }
  }, []);

  /**
   * Create a peer connection (initiator = caller)
   */
  const createPeer = useCallback(async (initiator, stream, targetUser) => {
    const config = await getIceServers();
    
    const peer = new Peer({
      initiator,
      stream,
      trickle: true,
      config
    });

    // Handle signaling data (offer/answer/ICE candidates)
    peer.on("signal", (data) => {
      console.log(`[${initiator ? 'Caller' : 'Callee'}] Sending signal:`, data.type);
      
      if (socket) {
        socket.emit("webrtc-signal", {
          target: targetUser,
          signal: data
        });
      }
    });

    // Handle incoming stream
    peer.on("stream", (remoteStream) => {
      console.log("Received remote stream");
      
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      
      setConnectionState("connected");
    });

    // Handle connection state
    peer.on("connect", () => {
      console.log("Peer connected!");
      setConnectionState("connected");
    });

    peer.on("close", () => {
      console.log("Peer connection closed");
      setConnectionState("disconnected");
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      setConnectionState("failed");
    });

    return peer;
  }, [socket, getIceServers]);

  /**
   * Clean up call resources
   */
  const handleCallEnd = useCallback(() => {
    console.log("Ending call and cleaning up");
    
    // Destroy peer connection
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    
    // Stop all media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }
    
    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // Reset state
    setIsCallActive(false);
    setCallDialogOpen(false);
    setIncomingCall(null);
    setCurrentCallTarget(null);
    setIsMuted(false);
    setIsVideoEnabled(true);
    setConnectionState("disconnected");
  }, []);

  /**
   * Start a call to another user
   */
  const startCall = useCallback(async (targetUser) => {
    try {
      console.log("=== STARTING CALL ===");
      console.log("Target:", targetUser);
      
      setCurrentCallTarget(targetUser);
      setIsCallActive(true);
      setCallDialogOpen(true);
      setConnectionState("connecting");
      
      // Get user media
      const stream = await getUserMedia();
      
      // Create peer as initiator (caller)
      const peer = await createPeer(true, stream, targetUser);
      peerRef.current = peer;
      
      console.log("Call initiated");
    } catch (error) {
      console.error("Error starting call:", error);
      handleCallEnd();
      throw error;
    }
  }, [getUserMedia, createPeer, handleCallEnd]);

  /**
   * Handle incoming call offer
   */
  const handleCallOffer = useCallback((data) => {
    console.log("Incoming call from:", data.from);
    // Store the offer signal with the incoming call data
    setIncomingCall({
      from: data.from,
      signal: data.signal
    });
    setCurrentCallTarget(data.from);
  }, []);

  /**
   * Accept an incoming call
   */
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    
    try {
      console.log("=== ACCEPTING CALL ===");
      console.log("From:", incomingCall.from);
      
      const callData = incomingCall;
      setIncomingCall(null);
      setIsCallActive(true);
      setCallDialogOpen(true);
      setConnectionState("connecting");
      
      // Get user media
      const stream = await getUserMedia();
      
      // Create peer as non-initiator (callee)
      const peer = await createPeer(false, stream, callData.from);
      peerRef.current = peer;
      
      // Important: Signal the incoming offer to the peer
      // This will trigger the peer to create and send an answer
      if (callData.signal) {
        console.log("Signaling incoming offer to peer");
        peer.signal(callData.signal);
      }
      
    } catch (error) {
      console.error("Error accepting call:", error);
      handleCallEnd();
      throw error;
    }
  }, [incomingCall, getUserMedia, createPeer, handleCallEnd]);

  /**
   * Decline an incoming call
   */
  const declineCall = useCallback(() => {
    if (socket && incomingCall) {
      socket.emit("call-declined", {
        target: incomingCall.from
      });
    }
    
    setIncomingCall(null);
    setCurrentCallTarget(null);
  }, [socket, incomingCall]);

  /**
   * Handle incoming WebRTC signal (offer, answer, or ICE candidate)
   */
  const handleSignal = useCallback((data) => {
    console.log("Received signal from:", data.from, "Type:", data.signal?.type || 'candidate');
    
    if (!peerRef.current) {
      // If no peer exists and this is an offer, store it for when user accepts
      if (data.signal?.type === 'offer') {
        console.log("Storing offer for incoming call");
        setIncomingCall({
          from: data.from,
          signal: data.signal
        });
        setCurrentCallTarget(data.from);
      } else {
        console.warn("Received signal but no peer exists and not an offer");
      }
      return;
    }
    
    // We have a peer, signal it
    try {
      peerRef.current.signal(data.signal);
    } catch (error) {
      console.error("Error signaling peer:", error);
    }
  }, []);

  /**
   * End the current call
   */
  const endCall = useCallback(() => {
    if (socket && currentCallTarget) {
      socket.emit("call-end", {
        target: currentCallTarget
      });
    }
    
    handleCallEnd();
  }, [socket, currentCallTarget]);

  /**
   * Toggle microphone mute
   */
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted; // Toggle
        setIsMuted(!isMuted);
      }
    }
  }, [isMuted]);

  /**
   * Toggle video on/off
   */
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled; // Toggle
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  }, [isVideoEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, []);

  return {
    // State
    isCallActive,
    incomingCall,
    isMuted,
    isVideoEnabled,
    callDialogOpen,
    currentCallTarget,
    connectionState,
    
    // Refs
    localVideoRef,
    remoteVideoRef,
    
    // Functions
    startCall,
    acceptCall,
    declineCall,
    endCall,
    handleCallEnd,
    toggleMute,
    toggleVideo,
    
    // Signal handlers
    handleCallOffer,
    handleSignal,
  };
}
