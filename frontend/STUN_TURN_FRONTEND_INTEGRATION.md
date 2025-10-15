# Frontend STUN/TURN Integration

## Overview

The frontend has been successfully integrated with the STUN/TURN WebRTC server. This provides enhanced WebRTC connectivity with automatic fallback to public STUN servers if the service is unavailable.

## Changes Made

### 1. WebRTC Helper Utility (`src/utils/webrtc-helper.js`)

Created a reusable utility module that:
- Fetches ICE server configuration from the STUN/TURN service
- Provides automatic fallback to public STUN servers
- Creates pre-configured peer connections
- Monitors connection states

**Key Functions:**
- `getWebRTCConfig()` - Fetches STUN/TURN configuration
- `createPeerConnection()` - Creates configured peer connection
- `getTurnStats()` - Retrieves server statistics
- `isTurnServiceAvailable()` - Checks service availability

### 2. App.js Updates

**Imports:**
```javascript
import { getWebRTCConfig, isTurnServiceAvailable } from "./utils/webrtc-helper";
```

**State Management:**
- Added `turnServiceAvailable` state to track service status
- Periodic health checks every 30 seconds

**WebRTC Initialization:**
- Changed from hardcoded public STUN servers to dynamic configuration
- Now fetches STUN/TURN config from backend before creating peer connection
- Automatic fallback if service is unavailable

**UI Indicator:**
- Visual chip in the app bar showing TURN service status
- Green "TURN Active" when service is available
- Yellow "Fallback STUN" when using public servers
- Tooltip with detailed information

### 3. Environment Configuration

**Added to `.env`:**
```bash
REACT_APP_TURN_CONFIG_URL=http://localhost:8005/api/turn/config
REACT_APP_TURN_STATS_URL=http://localhost:8005/api/turn/stats
```

**Created `.env.example`** with configuration templates

## How It Works

### 1. Service Check on Startup

When the app loads:
```javascript
useEffect(() => {
  const checkTurnService = async () => {
    const available = await isTurnServiceAvailable();
    setTurnServiceAvailable(available);
  };
  checkTurnService();
  // Re-check every 30 seconds
  const interval = setInterval(checkTurnService, 30000);
  return () => clearInterval(interval);
}, []);
```

### 2. Dynamic Configuration Fetching

When initiating a WebRTC call:
```javascript
// Old hardcoded approach
const pcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

// New dynamic approach
const pcConfig = await getWebRTCConfig();
```

### 3. Automatic Fallback

If the STUN/TURN service is unavailable:
- The helper automatically returns public STUN servers
- User experience is seamless
- Console logs indicate fallback mode

## Visual Indicators

### TURN Service Active (Green)
```
[✓ TURN Active]
```
- STUN/TURN server is running
- Using custom configuration
- Enhanced NAT traversal available

### Fallback Mode (Yellow)
```
[⚠ Fallback STUN]
```
- STUN/TURN service unavailable
- Using public STUN servers
- Basic connectivity only

## Testing

### 1. With STUN/TURN Service Running

```bash
# Start all services
docker-compose up -d

# Frontend will show "TURN Active"
# WebRTC uses custom STUN/TURN server
```

### 2. Without STUN/TURN Service

```bash
# Stop STUN/TURN service
docker-compose stop stun-turn-service

# Frontend will show "Fallback STUN"
# WebRTC uses public STUN servers
```

### 3. Check Configuration in Browser Console

When starting a video call, you'll see:
```
Fetching STUN/TURN configuration...
Using STUN/TURN configuration from server: [...]
```

Or if unavailable:
```
Error fetching TURN config, using fallback public STUN servers
Using WebRTC configuration: { iceServers: [...] }
```

## Benefits

### 1. Enhanced Connectivity
- TURN relay for NAT traversal
- Better success rate for WebRTC connections
- Works behind restrictive firewalls

### 2. Reliability
- Automatic fallback to public servers
- No single point of failure
- Graceful degradation

### 3. Monitoring
- Visual service status indicator
- Console logging for debugging
- Access to server statistics

### 4. Flexibility
- Easy to update configuration
- Environment-based settings
- Production-ready setup

## Configuration for Different Environments

### Development (localhost)
```bash
REACT_APP_TURN_CONFIG_URL=http://localhost:8005/api/turn/config
```

### Production
```bash
REACT_APP_TURN_CONFIG_URL=https://turn.yourdomain.com/api/turn/config
```

### Docker Container
```bash
REACT_APP_TURN_CONFIG_URL=http://stun-turn-service:8005/api/turn/config
```

## Debugging

### Check Service Availability
```javascript
import { isTurnServiceAvailable } from './utils/webrtc-helper';

const available = await isTurnServiceAvailable();
console.log('TURN service available:', available);
```

### View Current Configuration
```javascript
import { getWebRTCConfig } from './utils/webrtc-helper';

const config = await getWebRTCConfig();
console.log('WebRTC Config:', config);
```

### Get Server Statistics
```javascript
import { getTurnStats } from './utils/webrtc-helper';

const stats = await getTurnStats();
console.log('TURN Stats:', stats);
```

## Files Modified

1. **Created:**
   - `frontend/src/utils/webrtc-helper.js` - WebRTC utility module
   - `frontend/.env.example` - Environment variable template

2. **Modified:**
   - `frontend/src/App.js` - Integrated STUN/TURN service
   - `frontend/.env` - Added TURN service URLs

## Next Steps

### Optional Enhancements

1. **Statistics Dashboard:**
   ```javascript
   import { getTurnStats } from './utils/webrtc-helper';
   
   // Display in UI
   const stats = await getTurnStats();
   // Show: active connections, bandwidth, etc.
   ```

2. **Connection Quality Indicator:**
   ```javascript
   peerConnection.oniceconnectionstatechange = () => {
     if (peerConnection.iceConnectionState === 'connected') {
       // Show "Excellent" connection
     }
   };
   ```

3. **Advanced Monitoring:**
   - Track ICE candidate types (host, srflx, relay)
   - Display connection type in UI
   - Log connection quality metrics

## Troubleshooting

### Issue: "Fallback STUN" always showing

**Solution:**
1. Check STUN/TURN service is running: `docker ps | grep stun-turn`
2. Verify port 8005 is accessible: `curl http://localhost:8005/health`
3. Check browser console for errors
4. Ensure `.env` has correct URL

### Issue: No video connection

**Solution:**
1. Check if TURN credentials are correct
2. Verify firewall allows UDP ports 49152-49200
3. Review browser console for ICE candidate errors
4. Test with: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

### Issue: Environment variables not loading

**Solution:**
1. Restart development server after changing `.env`
2. Ensure variables start with `REACT_APP_`
3. Clear browser cache
4. Check variables are defined: `console.log(process.env.REACT_APP_TURN_CONFIG_URL)`

## Summary

✅ **Frontend successfully integrated with STUN/TURN service**

- Dynamic ICE server configuration
- Automatic fallback mechanism
- Visual service status indicator
- Environment-based configuration
- Production-ready setup

The frontend now automatically uses the custom STUN/TURN server when available, with seamless fallback to public STUN servers for reliability.
