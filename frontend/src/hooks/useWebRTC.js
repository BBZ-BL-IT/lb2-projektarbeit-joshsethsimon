import { useRef, useState, useEffect, useCallback } from "react";
import { getWebRTCConfig } from "../utils/webrtc-helper";

export function useWebRTC(socket) {
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
  const pendingIceCandidatesRef = useRef([]);

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
          throw new Error("Connection failed");
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

      throw new Error(`Video call error: ${errorMessage}`);
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
      handleCallEnd();
      throw error;
    }
  };

  const handleCallOffer = useCallback(async (data) => {
    console.log("Received call offer from", data.from);
    setIncomingCall(data);
    setCurrentCallTarget(data.from);
  }, []);

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
      handleCallEnd();
      throw error;
    }
  };

  const declineCall = () => {
    if (socket && incomingCall) {
      socket.emit("call-end", { target: incomingCall.from });
    }
    setIncomingCall(null);
    setCurrentCallTarget(null);
  };

  const handleCallAnswer = useCallback(async (data) => {
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
  }, []);

  const handleIceCandidate = useCallback(async (data) => {
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
  }, []);

  const endCall = () => {
    if (socket && currentCallTarget) {
      socket.emit("call-end", { target: currentCallTarget });
    }
    handleCallEnd();
  };

  const handleCallEnd = useCallback(() => {
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
  }, []);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
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
    
    // WebRTC handlers
    handleCallOffer,
    handleCallAnswer,
    handleIceCandidate,
  };
}
