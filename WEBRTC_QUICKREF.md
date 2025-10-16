# WebRTC Quick Reference

## Testing Commands

### Test TURN server is running
```bash
./test-turn.sh
```

### View TURN configuration
```bash
curl http://localhost:8005/api/turn/config | jq
```

### View TURN statistics
```bash
curl http://localhost:8005/api/turn/stats | jq
```

### View diagnostic information
```bash
curl http://localhost:8005/api/turn/diagnostic | jq
```

### Check TURN server logs
```bash
docker logs -f stun-turn-service
```

### Test STUN from inside container
```bash
docker exec -it stun-turn-service turnutils_stunclient localhost
```

### Test TURN from inside container
```bash
docker exec -it stun-turn-service turnutils_uclient -v -u turnuser -w turnpassword localhost
```

## Browser Console Testing

### Test WebRTC connectivity
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
pc.onicecandidate = (e) => {
  if (e.candidate) {
    console.log('ICE:', e.candidate.type, e.candidate.address || e.candidate.ip);
  } else {
    console.log('ICE gathering complete');
  }
};

pc.createOffer().then(offer => pc.setLocalDescription(offer));

// After 5 seconds, check for TURN relay candidates
setTimeout(() => {
  pc.getStats().then(stats => {
    let hasRelay = false;
    stats.forEach(stat => {
      if (stat.type === 'local-candidate' && stat.candidateType === 'relay') {
        hasRelay = true;
        console.log('✓ TURN relay candidate:', stat);
      }
    });
    if (!hasRelay) {
      console.error('✗ No TURN relay - server may not be working');
    }
  });
}, 5000);
```

### Check during active call
```javascript
// Get peer connection stats during a call
const pc = window.peerConnection; // If exposed
if (pc) {
  pc.getStats().then(stats => {
    stats.forEach(stat => {
      if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
        console.log('Active connection:', stat);
      }
    });
  });
}
```

## Common Issues & Solutions

### Issue: No TURN relay candidates

**Check:**
```bash
docker logs stun-turn-service | grep -i error
curl http://localhost:8005/health
```

**Fix:**
- Restart service: `docker-compose restart stun-turn-service`
- Check credentials in docker-compose.yml match
- Verify EXTERNAL_IP is set for production

### Issue: "Connection failed" during calls

**Check:**
```bash
docker exec stun-turn-service cat /tmp/turnserver.conf
```

**Fix:**
- Ensure EXTERNAL_IP is set to public IP in production
- Open firewall ports: 3478, 5349, 49152-49200
- Check both UDP and TCP are allowed

### Issue: Empty stats or "service not available"

**Check:**
```bash
docker ps | grep stun-turn-service
curl http://localhost:8005/api/turn/config
```

**Fix:**
- Container not running: `docker-compose up -d stun-turn-service`
- API not responding: Check logs for startup errors
- Wrong URL: Use relative `/api/turn/config` in browser

## Configuration Files

### Development (docker-compose.yml)
- Default credentials: `turnuser:turnpassword`
- Host: `localhost:3478`

### Production (docker-compose.prod.yml)
- Use `.env.production` for configuration
- Set `EXTERNAL_IP` to server's public IP
- Change default credentials!

### Key Environment Variables
```env
TURN_SERVER_HOST=app.lab.joku.dev    # Your domain
TURN_USERNAME=turnuser                # Change in production
TURN_PASSWORD=turnpassword            # Change in production
EXTERNAL_IP=1.2.3.4                   # Server public IP
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
```

## Port Requirements

| Port | Protocol | Purpose |
|------|----------|---------|
| 3478 | UDP/TCP | STUN/TURN main port |
| 5349 | TCP | TURN over TLS |
| 8005 | TCP | API endpoint |
| 49152-49200 | UDP | TURN relay port range |

## Monitoring

### Real-time statistics
```bash
watch -n 2 'curl -s http://localhost:8005/api/turn/stats | jq'
```

### Active sessions
```bash
curl http://localhost:8005/api/turn/sessions | jq
```

### Connection events in RabbitMQ
Access RabbitMQ management: http://localhost:15672
- Queue: `webrtc_events`
- View messages to see connection events

## Production Checklist

- [ ] Changed TURN credentials from defaults
- [ ] Set EXTERNAL_IP to server's public IP address
- [ ] Opened firewall ports (3478, 5349, 49152-49200)
- [ ] Tested with `./test-turn.sh`
- [ ] Verified TURN relay candidates appear in browser console
- [ ] Tested actual video calls between two browsers/devices
- [ ] Monitored logs for errors: `docker logs stun-turn-service`
- [ ] Checked stats show active connections: `/api/turn/stats`

## Resources

- Full setup guide: [WEBRTC_SETUP.md](./WEBRTC_SETUP.md)
- Coturn docs: https://github.com/coturn/coturn
- WebRTC debugging: https://webrtc.github.io/samples/
