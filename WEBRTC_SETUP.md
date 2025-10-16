# WebRTC Setup Guide

This document explains the WebRTC configuration for video/audio calling in this chat application.

## Architecture

The system uses:
- **STUN Server**: For NAT traversal and discovering public IP addresses
- **TURN Server**: For relaying media when direct peer-to-peer fails
- **Coturn**: Open-source STUN/TURN server implementation
- **Signaling**: WebSocket through chat-service for SDP and ICE candidate exchange

## Configuration

### Development (docker-compose.yml)

Default credentials for testing:
- TURN Username: `turnuser`
- TURN Password: `turnpassword`
- TURN Host: `localhost:3478`

### Production (docker-compose.prod.yml)

Configure via `.env.production`:
```env
DOMAIN=app.lab.joku.dev
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpassword
EXTERNAL_IP=YOUR_SERVER_PUBLIC_IP
```

**IMPORTANT**: Set `EXTERNAL_IP` to your server's public IP address for production deployments!

## Port Configuration

Required ports:
- **3478/UDP**: STUN/TURN main port (UDP)
- **3478/TCP**: STUN/TURN main port (TCP)
- **5349/TCP**: TURN over TLS (for secure connections)
- **49152-49200/UDP**: TURN relay port range
- **8005/TCP**: TURN configuration API

## Firewall Rules

Ensure these ports are open in your firewall:
```bash
# STUN/TURN
ufw allow 3478/udp
ufw allow 3478/tcp
ufw allow 5349/tcp
ufw allow 49152:49200/udp

# API
ufw allow 8005/tcp
```

## Testing

### 1. Check TURN Server Status
```bash
docker logs stun-turn-service
```

### 2. Test STUN Connectivity
```bash
# From inside container
docker exec -it stun-turn-service sh
turnutils_stunclient localhost
```

### 3. Test TURN Connectivity
```bash
# From inside container
docker exec -it stun-turn-service sh
turnutils_uclient -v -u turnuser -w turnpassword localhost
```

### 4. Check API Endpoint
```bash
curl http://localhost:8005/api/turn/config
```

Expected response:
```json
{
  "stunServer": "stun:localhost:3478",
  "turnServer": {
    "urls": [
      "turn:localhost:3478",
      "turn:localhost:3478?transport=tcp",
      "turn:localhost:3478?transport=udp"
    ],
    "username": "turnuser",
    "credential": "turnpassword"
  },
  "iceServers": [...]
}
```

### 5. Check TURN Statistics
```bash
curl http://localhost:8005/api/turn/stats
```

## Troubleshooting

### Issue: "No connection" or empty TURN stats

**Causes:**
1. TURN server not running
2. Firewall blocking ports
3. Wrong credentials
4. Missing EXTERNAL_IP in production

**Solutions:**
1. Check logs: `docker logs stun-turn-service`
2. Verify ports: `netstat -tuln | grep 3478`
3. Check config: `docker exec stun-turn-service cat /tmp/turnserver.conf`
4. Test connectivity from browser console:
```javascript
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:localhost:3478' },
    { 
      urls: 'turn:localhost:3478',
      username: 'turnuser',
      credential: 'turnpassword'
    }
  ]
});
pc.createDataChannel('test');
pc.createOffer().then(offer => pc.setLocalDescription(offer));
pc.onicecandidate = e => console.log('ICE:', e.candidate);
```

### Issue: "Connection failed" during calls

**Causes:**
1. Symmetric NAT (both peers behind strict NATs)
2. TURN server not accessible
3. Credentials mismatch
4. Port range too limited

**Solutions:**
1. Verify EXTERNAL_IP is set correctly
2. Expand port range (if possible): edit `turnserver.conf` max-port
3. Check credentials match in all configs
4. Enable verbose logging in turnserver.conf

### Issue: Video/Audio not showing

**Causes:**
1. Camera/microphone permissions denied
2. Devices in use by another app
3. HTTPS required (for some browsers)
4. Track negotiation failed

**Solutions:**
1. Check browser console for permission errors
2. Close other apps using camera/mic
3. Use HTTPS or localhost for testing
4. Check browser compatibility (Chrome/Firefox/Safari latest)

## Browser Console Debugging

Check WebRTC connection state:
```javascript
// In browser console during a call
// Check if peer connection exists
console.log(window.peerConnection);

// Check ICE connection state
console.log(window.peerConnection?.iceConnectionState);

// Check connection state
console.log(window.peerConnection?.connectionState);

// Get ICE candidates
window.peerConnection?.getStats().then(stats => {
  stats.forEach(stat => {
    if (stat.type === 'candidate-pair' || stat.type === 'local-candidate' || stat.type === 'remote-candidate') {
      console.log(stat);
    }
  });
});
```

## Network Architecture

```
┌─────────────┐                   ┌──────────────┐
│   Browser   │◄─────WebRTC──────►│   Browser    │
│   (User A)  │                   │   (User B)   │
└──────┬──────┘                   └──────┬───────┘
       │                                 │
       │          ┌──────────┐          │
       └─────────►│  STUN/   │◄─────────┘
                  │  TURN    │
                  │  Server  │
                  └────┬─────┘
                       │
                  ┌────▼─────┐
                  │   Chat   │
                  │  Service │
                  │(Signaling)│
                  └──────────┘
```

## Production Deployment Checklist

- [ ] Set strong TURN credentials (not default)
- [ ] Configure EXTERNAL_IP to server's public IP
- [ ] Open firewall ports (3478, 5349, 49152-49200)
- [ ] Test with https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
- [ ] Enable TLS for TURN (optional, requires certificates)
- [ ] Monitor TURN server logs for issues
- [ ] Set up rate limiting to prevent abuse
- [ ] Consider using time-limited credentials (use-auth-secret)

## Performance Tuning

For better performance in production:

1. **Increase relay port range** (if you have ports available):
   ```
   min-port=49152
   max-port=65535
   ```

2. **Enable bandwidth limiting** (in turnserver.conf):
   ```
   max-bps=1000000
   total-quota=100
   user-quota=10
   ```

3. **Use separate STUN servers** for redundancy:
   ```javascript
   iceServers: [
     { urls: 'stun:stun.l.google.com:19302' },
     { urls: 'stun:your-turn-server:3478' },
     { 
       urls: 'turn:your-turn-server:3478',
       username: 'user',
       credential: 'pass'
     }
   ]
   ```

## References

- [Coturn Documentation](https://github.com/coturn/coturn)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [STUN/TURN Protocols](https://datatracker.ietf.org/doc/html/rfc5766)
