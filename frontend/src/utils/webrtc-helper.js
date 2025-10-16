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

// Fallback public STUN servers (used if backend is unavailable)
const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

// Cache for TURN config
let cachedConfig = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch STUN/TURN configuration from the backend
 * @param {boolean} forceRefresh - Force refresh cached config
 * @returns {Promise<Object>} WebRTC configuration object
 */
export async function getWebRTCConfig(forceRefresh = false) {
  // Return cached config if available and fresh
  const now = Date.now();
  if (!forceRefresh && cachedConfig && (now - lastFetchTime) < CACHE_DURATION) {
    console.log('Using cached STUN/TURN configuration');
    return cachedConfig;
  }

  try {
    console.log('Fetching STUN/TURN configuration from:', TURN_CONFIG_URL);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(TURN_CONFIG_URL, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch TURN config: ${response.status} ${response.statusText}`);
    }
    
    const config = await response.json();
    
    if (!config.iceServers || !Array.isArray(config.iceServers)) {
      throw new Error('Invalid TURN config response: missing iceServers');
    }
    
    console.log('✓ Using STUN/TURN configuration from server');
    console.log('  ICE Servers:', config.iceServers.length);
    config.iceServers.forEach((server, i) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      console.log(`  [${i}]`, urls.join(', '));
      if (server.username) {
        console.log(`      Auth: ${server.username}:***`);
      }
    });
    
    const rtcConfig = {
      iceServers: config.iceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all', // Use both STUN and TURN
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    };
    
    // Cache the config
    cachedConfig = rtcConfig;
    lastFetchTime = now;
    
    return rtcConfig;
  } catch (error) {
    console.error('Error fetching TURN config:', error.message);
    console.warn('⚠ Falling back to public STUN servers (no TURN relay)');
    console.log('  This may cause connection issues behind restrictive NATs');
    
    const fallbackConfig = {
      iceServers: FALLBACK_ICE_SERVERS,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    };
    
    // Cache fallback config too (but for shorter duration)
    cachedConfig = fallbackConfig;
    lastFetchTime = now - (CACHE_DURATION - 30000); // Will retry in 30 seconds
    
    return fallbackConfig;
  }
}

/**
 * Create a WebRTC peer connection with STUN/TURN configuration
 * @param {Object} options - Configuration options
 * @returns {Promise<RTCPeerConnection>} Configured peer connection
 */
export async function createPeerConnection(options = {}) {
  const config = await getWebRTCConfig(options.forceRefresh);
  
  console.log('Creating RTCPeerConnection with config:', {
    iceServers: config.iceServers.length,
    iceTransportPolicy: config.iceTransportPolicy,
    iceCandidatePoolSize: config.iceCandidatePoolSize,
  });
  
  const peerConnection = new RTCPeerConnection(config);
  
  // Log ICE connection state changes
  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE Connection State:', peerConnection.iceConnectionState);
    
    if (peerConnection.iceConnectionState === 'failed') {
      console.error('ICE connection failed - may need TURN server');
    } else if (peerConnection.iceConnectionState === 'disconnected') {
      console.warn('ICE connection disconnected - attempting to reconnect');
    } else if (peerConnection.iceConnectionState === 'connected') {
      console.log('✓ ICE connection established successfully');
    }
  };
  
  // Log ICE gathering state changes
  peerConnection.onicegatheringstatechange = () => {
    console.log('ICE Gathering State:', peerConnection.iceGatheringState);
    
    if (peerConnection.iceGatheringState === 'complete') {
      console.log('✓ ICE gathering complete');
    }
  };
  
  // Log connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log('Connection State:', peerConnection.connectionState);
    
    if (peerConnection.connectionState === 'connected') {
      console.log('✓ Peer connection established successfully');
      
      // Log connection statistics
      logConnectionStats(peerConnection);
    } else if (peerConnection.connectionState === 'failed') {
      console.error('Peer connection failed');
    }
  };
  
  // Log ICE candidates for debugging
  let candidateCount = { local: 0, relay: 0, srflx: 0, host: 0 };
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      const type = event.candidate.type;
      candidateCount[type] = (candidateCount[type] || 0) + 1;
      
      console.log(`ICE Candidate [${type}]:`, {
        type: event.candidate.type,
        protocol: event.candidate.protocol,
        address: event.candidate.address || event.candidate.ip,
        port: event.candidate.port,
      });
    } else {
      console.log('ICE Candidate Summary:', candidateCount);
      
      if (candidateCount.relay === 0) {
        console.warn('⚠ No TURN relay candidates - TURN server may not be working');
      } else {
        console.log('✓ TURN relay candidates generated');
      }
    }
  };
  
  return peerConnection;
}

/**
 * Log connection statistics for debugging
 * @param {RTCPeerConnection} pc - Peer connection
 */
async function logConnectionStats(pc) {
  try {
    const stats = await pc.getStats();
    const candidatePairs = [];
    const localCandidates = [];
    const remoteCandidates = [];
    
    stats.forEach(stat => {
      if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
        candidatePairs.push(stat);
      } else if (stat.type === 'local-candidate') {
        localCandidates.push(stat);
      } else if (stat.type === 'remote-candidate') {
        remoteCandidates.push(stat);
      }
    });
    
    if (candidatePairs.length > 0) {
      console.log('Active Candidate Pair:', candidatePairs[0]);
      
      const localCandidate = localCandidates.find(c => c.id === candidatePairs[0].localCandidateId);
      const remoteCandidate = remoteCandidates.find(c => c.id === candidatePairs[0].remoteCandidateId);
      
      console.log('Connection Type:', {
        local: localCandidate?.candidateType,
        remote: remoteCandidate?.candidateType,
        usingRelay: localCandidate?.candidateType === 'relay' || remoteCandidate?.candidateType === 'relay'
      });
    }
  } catch (error) {
    console.error('Error getting connection stats:', error);
  }
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
