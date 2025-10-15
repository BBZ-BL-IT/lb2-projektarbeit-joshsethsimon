# STUN/TURN Quick Reference

## Start/Stop
```bash
docker-compose up -d              # Start all services
docker-compose stop               # Stop all services  
docker-compose restart stun-turn-service  # Restart STUN/TURN
docker-compose logs -f stun-turn-service  # View logs
```

## Health Checks
```bash
curl http://localhost:8005/health              # Service health
curl http://localhost:8005/api/turn/config     # Get ICE config
curl http://localhost:8005/api/turn/stats      # Get statistics
curl http://localhost:8005/api/turn/sessions   # Active sessions
```

## Ports
| Port | Service | Description |
|------|---------|-------------|
| 3478 | STUN/TURN | Main UDP/TCP port |
| 5349 | TURN TLS | Secure TURN |
| 8005 | HTTP API | Stats & config |
| 8080 | Web Admin | TURN admin UI |
| 49152-49200 | TURN Relay | Media relay ports |

## Monitoring URLs
- RabbitMQ: http://localhost:15672 (guest/guest)
- TURN Stats: http://localhost:8005/api/turn/stats
- TURN Admin: http://localhost:8080

## RabbitMQ Queues
- `webrtc_events` - WebRTC connection events
- `logs` - All system logs

## Default Credentials
- Username: `turnuser`
- Password: `turnpassword`
- ⚠️ Change these in production!

## Frontend Integration
```javascript
// Fetch config
const response = await fetch('http://localhost:8005/api/turn/config');
const config = await response.json();

// Create peer connection
const pc = new RTCPeerConnection({ iceServers: config.iceServers });
```

## Or use helper:
```javascript
import { createPeerConnection } from './utils/webrtc-helper';
const pc = await createPeerConnection();
```

## Test STUN/TURN
1. Visit: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
2. Add: `stun:localhost:3478`
3. Add: `turn:localhost:3478` (user: turnuser, pass: turnpassword)
4. Click "Gather candidates"

## Event Types
- `connection_established` - New connection
- `turn_allocation_created` - TURN relay allocated
- `connection_closed` - Connection ended
- `turn_error` - Error occurred

## Troubleshooting
```bash
# Check service
docker ps | grep stun-turn

# View logs
docker logs stun-turn-service

# Check RabbitMQ
docker exec -it rabbitmq rabbitmqadmin list queues

# Test STUN
npm install -g stun
stun localhost:3478
```

## Files
- `/stun-turn-service/README.md` - Overview
- `/stun-turn-service/INTEGRATION_GUIDE.md` - Integration
- `/stun-turn-service/SETUP_AND_TESTING.md` - Testing
- `/STUN_TURN_IMPLEMENTATION.md` - Complete docs
- `/IMPLEMENTATION_CHECKLIST.md` - Checklist
