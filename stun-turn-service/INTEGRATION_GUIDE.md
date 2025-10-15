# STUN/TURN Server Integration Guide

## Overview

This project now includes a dedicated STUN/TURN server for WebRTC connections with automatic event logging to RabbitMQ.

## Architecture

```
┌─────────────┐     WebRTC      ┌─────────────┐
│   Client A  │◄───Signaling───►│   Client B  │
└─────────────┘                 └─────────────┘
       │                               │
       │         ICE/STUN/TURN         │
       └───────────────┬───────────────┘
                       │
                ┌──────▼──────┐
                │ STUN/TURN   │
                │   Server    │
                └──────┬──────┘
                       │
                       ▼
                ┌──────────────┐
                │   RabbitMQ   │
                │  (Events)    │
                └──────────────┘
```

## What's Included

1. **STUN Server** (Port 3478)
   - Helps clients discover their public IP address
   - Enables NAT traversal for direct peer-to-peer connections

2. **TURN Server** (Port 3478, 5349)
   - Relays media when direct connection fails
   - Supports UDP, TCP, and TLS connections

3. **Event Logging**
   - All connection events logged to RabbitMQ
   - Tracks: connections, allocations, errors, bandwidth

4. **Monitoring API** (Port 8005)
   - Real-time statistics
   - Active session tracking
   - Configuration endpoints

## Using STUN/TURN in Frontend

### Update your WebRTC configuration

In your React frontend, fetch the ICE server configuration:

```javascript
// Fetch STUN/TURN configuration
const response = await fetch('http://localhost:8005/api/turn/config');
const config = await response.json();

// Create peer connection with STUN/TURN servers
const peerConnection = new RTCPeerConnection({
  iceServers: config.iceServers
});
```

### Complete Example

```javascript
// webrtc-config.js
export async function getWebRTCConfig() {
  try {
    const response = await fetch('http://localhost:8005/api/turn/config');
    const config = await response.json();
    return { iceServers: config.iceServers };
  } catch (error) {
    console.error('Failed to fetch TURN config:', error);
    // Fallback to public STUN servers
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    };
  }
}

// In your WebRTC component
import { getWebRTCConfig } from './webrtc-config';

async function startCall() {
  const config = await getWebRTCConfig();
  const peerConnection = new RTCPeerConnection(config);
  
  // Add your media streams
  const stream = await navigator.mediaDevices.getUserMedia({ 
    video: true, 
    audio: true 
  });
  
  stream.getTracks().forEach(track => {
    peerConnection.addTrack(track, stream);
  });
  
  // Listen for ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      // Send candidate to other peer via signaling server
      socket.emit('ice-candidate', event.candidate);
    }
  };
  
  // Create and send offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('call-offer', { target: targetUser, offer });
}
```

## Integration with Chat Service

The chat service already has WebRTC signaling implemented. The STUN/TURN server enhances it:

### Existing Signaling (in chat-service/server.js)
- `call-offer`: Send call invitation
- `call-answer`: Accept call
- `ice-candidate`: Exchange ICE candidates
- `call-end`: End call

### New STUN/TURN Benefits
- **Better NAT traversal**: Works behind firewalls
- **Fallback relay**: TURN relay when direct connection fails
- **Event tracking**: All WebRTC events logged to RabbitMQ
- **Statistics**: Monitor connection quality and usage

## Viewing WebRTC Events

### 1. Check RabbitMQ Management UI
Visit: http://localhost:15672 (guest/guest)
- Queue: `webrtc_events` - WebRTC-specific events
- Queue: `logs` - All system logs

### 2. Query STUN/TURN API

```bash
# Get current statistics
curl http://localhost:8005/api/turn/stats

# Get active sessions
curl http://localhost:8005/api/turn/sessions

# Get server configuration
curl http://localhost:8005/api/turn/config
```

### 3. Log Service Dashboard
The log-service automatically consumes events from both queues and stores them in MongoDB.

## Event Types Logged

### Connection Events
- `connection_established` - New WebRTC connection started
- `connection_closed` - Connection ended
- `turn_allocation_created` - TURN relay allocated

### Service Events
- `service_started` - STUN/TURN service started
- `turn_error` - Error occurred

### Each event includes:
```javascript
{
  eventType: 'connection_established',
  service: 'stun-turn-service',
  details: {
    sessionId: '...',
    username: 'turnuser',
    origin: '192.168.1.100:54321'
  },
  timestamp: '2024-10-15T07:30:00.000Z'
}
```

## Production Configuration

For production deployment:

1. **Update Credentials**
   ```bash
   # Edit stun-turn-service/turnserver.conf
   # Change:
   user=youruser:yourpassword
   realm=yourdomain.com
   ```

2. **Set External IP**
   ```bash
   # In docker-compose.yml, add:
   environment:
     - TURN_SERVER_HOST=your-public-ip-or-domain
   ```

3. **Enable TLS**
   ```bash
   # Add SSL certificates to turnserver.conf
   cert=/path/to/cert.pem
   pkey=/path/to/key.pem
   ```

4. **Use Authentication Secret** (Recommended)
   ```bash
   # In turnserver.conf:
   use-auth-secret
   static-auth-secret=YOUR_SECRET_KEY
   
   # Generate time-limited credentials in your app
   ```

## Testing the STUN/TURN Server

### Test STUN functionality
```bash
# Using stun tool
npm install -g stun

stun localhost:3478
```

### Test with WebRTC sample
Visit: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

Configure:
- STUN URI: `stun:localhost:3478`
- TURN URI: `turn:localhost:3478`
- Username: `turnuser`
- Password: `turnpassword`

Click "Gather candidates" and verify you get candidates.

## Troubleshooting

### No ICE candidates
- Check firewall rules for UDP port 3478
- Verify STUN/TURN service is running: `docker ps`
- Check logs: `docker logs stun-turn-service`

### TURN relay not working
- Ensure UDP ports 49152-49200 are open
- Verify credentials are correct
- Check RabbitMQ for error events

### Events not appearing in RabbitMQ
- Verify RabbitMQ is running: `docker ps`
- Check service logs: `docker logs stun-turn-service`
- Test RabbitMQ connection: `curl http://localhost:15672`

## Next Steps

1. **Frontend Integration**: Update your React app to use the STUN/TURN config endpoint
2. **Monitoring**: Create a dashboard to visualize WebRTC statistics
3. **Security**: Implement time-limited credentials for TURN server
4. **Scaling**: For high traffic, consider multiple TURN servers with load balancing

## References

- [Coturn Documentation](https://github.com/coturn/coturn)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [STUN/TURN Protocols](https://webrtc.org/getting-started/turn-server)
