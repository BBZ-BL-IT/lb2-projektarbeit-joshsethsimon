/**
 * WebRTC Configuration Helper
 * 
 * Fetches STUN/TURN server configuration from the backend
 * and provides WebRTC peer connection configuration.
 */

// Use relative URLs to go through Caddy proxy by default
// This allows the app to work in any environment without hardcoded ports
const TURN_CONFIG_URL = process.env.REACT_APP_TURN_CONFIG_URL || '/api/turn/config';
const TURN_STATS_URL = process.env.REACT_APP_TURN_STATS_URL || '/api/turn/stats';

// Fallback public STUN servers
const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
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
    
    console.log('Using STUN/TURN configuration from server:', config.iceServers);
    
    return {
      iceServers: config.iceServers,
      iceCandidatePoolSize: 10,
    };
  } catch (error) {
    console.error('Error fetching TURN config, using fallback public STUN servers:', error);
    
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
  
  // Log connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
  };
  
  return peerConnection;
}

/**
 * Get STUN/TURN server statistics
 * @returns {Promise<Object>} Server statistics
 */
export async function getTurnStats() {
  try {
    const response = await fetch(TURN_STATS_URL);
    
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
 * Check if STUN/TURN service is available
 * @returns {Promise<boolean>} True if service is available
 */
export async function isTurnServiceAvailable() {
  try {
    const response = await fetch(TURN_CONFIG_URL, { 
      method: 'GET',
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });
    return response.ok;
  } catch (error) {
    console.log('STUN/TURN service not available, will use fallback');
    return false;
  }
}

export default {
  getWebRTCConfig,
  createPeerConnection,
  getTurnStats,
  isTurnServiceAvailable
};
