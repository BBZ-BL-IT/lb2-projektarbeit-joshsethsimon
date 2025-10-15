/**
 * WebRTC Configuration Helper
 * 
 * Fetches STUN/TURN server configuration from the backend
 * and provides WebRTC peer connection configuration.
 */

const TURN_CONFIG_URL = 'http://localhost:8005/api/turn/config';

// Fallback public STUN servers
const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Fetch STUN/TURN configuration from the backend
 * @returns {Promise<Object>} WebRTC configuration object
 */
export async function getWebRTCConfig() {
  try {
    const response = await fetch(TURN_CONFIG_URL);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch TURN config: ${response.statusText}`);
    }
    
    const config = await response.json();
    
    console.log('Using STUN/TURN configuration:', config.iceServers);
    
    return {
      iceServers: config.iceServers,
      iceCandidatePoolSize: 10,
    };
  } catch (error) {
    console.error('Error fetching TURN config, using fallback:', error);
    
    return {
      iceServers: FALLBACK_ICE_SERVERS,
      iceCandidatePoolSize: 10,
    };
  }
}

/**
 * Create a WebRTC peer connection with STUN/TURN configuration
 * @returns {Promise<RTCPeerConnection>} Configured peer connection
 */
export async function createPeerConnection() {
  const config = await getWebRTCConfig();
  const peerConnection = new RTCPeerConnection(config);
  
  // Log ICE connection state changes
  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', peerConnection.iceConnectionState);
  };
  
  // Log ICE gathering state changes
  peerConnection.onicegatheringstatechange = () => {
    console.log('ICE gathering state:', peerConnection.iceGatheringState);
  };
  
  return peerConnection;
}

/**
 * Get STUN/TURN server statistics
 * @returns {Promise<Object>} Server statistics
 */
export async function getTurnStats() {
  try {
    const response = await fetch('http://localhost:8005/api/turn/stats');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch TURN stats: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching TURN stats:', error);
    return null;
  }
}

/**
 * Example usage in a React component
 */
export const WebRTCExample = {
  // Initialize video call
  startCall: async function(localVideo, remoteVideo, socket, targetUser) {
    try {
      // Create peer connection with STUN/TURN config
      const pc = await createPeerConnection();
      
      // Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      // Display local video
      if (localVideo) {
        localVideo.srcObject = stream;
      }
      
      // Add tracks to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
      
      // Handle incoming remote stream
      pc.ontrack = (event) => {
        if (remoteVideo && event.streams[0]) {
          remoteVideo.srcObject = event.streams[0];
        }
      };
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', {
            target: targetUser,
            candidate: event.candidate
          });
        }
      };
      
      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socket.emit('call-offer', {
        target: targetUser,
        offer: offer
      });
      
      return pc;
    } catch (error) {
      console.error('Error starting call:', error);
      throw error;
    }
  },
  
  // Answer incoming call
  answerCall: async function(localVideo, remoteVideo, socket, callerUser, offer) {
    try {
      // Create peer connection with STUN/TURN config
      const pc = await createPeerConnection();
      
      // Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      // Display local video
      if (localVideo) {
        localVideo.srcObject = stream;
      }
      
      // Add tracks to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
      
      // Handle incoming remote stream
      pc.ontrack = (event) => {
        if (remoteVideo && event.streams[0]) {
          remoteVideo.srcObject = event.streams[0];
        }
      };
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', {
            target: callerUser,
            candidate: event.candidate
          });
        }
      };
      
      // Set remote description (offer)
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socket.emit('call-answer', {
        target: callerUser,
        answer: answer
      });
      
      return pc;
    } catch (error) {
      console.error('Error answering call:', error);
      throw error;
    }
  }
};

export default {
  getWebRTCConfig,
  createPeerConnection,
  getTurnStats,
  WebRTCExample
};
