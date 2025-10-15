# STUN/TURN Server Setup & Testing Guide

## Quick Setup

### 1. Start the Services

```bash
# Start all services including STUN/TURN
docker-compose up -d

# Verify all services are running
docker-compose ps

# Check STUN/TURN service logs
docker-compose logs -f stun-turn-service
```

### 2. Verify STUN/TURN is Running

```bash
# Check health endpoint
curl http://localhost:8005/health

# Get TURN configuration
curl http://localhost:8005/api/turn/config

# Get statistics
curl http://localhost:8005/api/turn/stats
```

## Testing STUN/TURN Server

### Method 1: Using Trickle ICE Test

1. Open https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
2. Remove default servers
3. Add your STUN server:
   - **STUN URI**: `stun:localhost:3478`
4. Add your TURN server:
   - **TURN URI**: `turn:localhost:3478`
   - **Username**: `turnuser`
   - **Password**: `turnpassword`
5. Click "Gather candidates"
6. You should see candidates with type `srflx` (STUN) and `relay` (TURN)

### Method 2: Using Command Line

#### Test STUN (requires stun tool)

```bash
# Install stun tool
npm install -g stun

# Test STUN server
stun localhost:3478
```

#### Test using Python

```python
import socket
import struct

# Create STUN binding request
def create_stun_request():
    msg_type = 0x0001  # Binding Request
    msg_length = 0
    magic_cookie = 0x2112A442
    transaction_id = b'\x00' * 12
    
    return struct.pack('!HHI', msg_type, msg_length, magic_cookie) + transaction_id

# Send STUN request
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(5)

stun_request = create_stun_request()
sock.sendto(stun_request, ('localhost', 3478))

response, server = sock.recvfrom(1024)
print(f"Received response from {server}: {len(response)} bytes")
sock.close()
```

### Method 3: Test with your Application

Create a simple HTML test page:

```html
<!DOCTYPE html>
<html>
<head>
    <title>STUN/TURN Test</title>
</head>
<body>
    <h1>STUN/TURN Server Test</h1>
    <button onclick="testConnection()">Test STUN/TURN</button>
    <pre id="output"></pre>

    <script>
        async function testConnection() {
            const output = document.getElementById('output');
            output.textContent = 'Testing STUN/TURN server...\n';

            try {
                // Fetch configuration
                const response = await fetch('http://localhost:8005/api/turn/config');
                const config = await response.json();
                
                output.textContent += 'Configuration fetched:\n' + 
                    JSON.stringify(config.iceServers, null, 2) + '\n\n';

                // Create peer connection
                const pc = new RTCPeerConnection({ iceServers: config.iceServers });

                // Collect ICE candidates
                const candidates = [];
                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        candidates.push(event.candidate);
                        output.textContent += `ICE Candidate: ${event.candidate.type} - ${event.candidate.candidate}\n`;
                    } else {
                        output.textContent += `\nTotal candidates: ${candidates.length}\n`;
                        
                        const stunCandidates = candidates.filter(c => c.type === 'srflx');
                        const turnCandidates = candidates.filter(c => c.type === 'relay');
                        
                        output.textContent += `STUN (srflx) candidates: ${stunCandidates.length}\n`;
                        output.textContent += `TURN (relay) candidates: ${turnCandidates.length}\n`;
                    }
                };

                // Create a dummy data channel to trigger ICE gathering
                pc.createDataChannel('test');
                
                // Create offer to start ICE gathering
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

            } catch (error) {
                output.textContent += 'Error: ' + error.message;
            }
        }
    </script>
</body>
</html>
```

Save as `test-stun-turn.html` and open in a browser.

## Monitoring WebRTC Events

### 1. RabbitMQ Management UI

1. Open http://localhost:15672
2. Login with `guest` / `guest`
3. Go to "Queues" tab
4. Click on `webrtc_events` queue
5. Click "Get messages" to see events

### 2. Check Statistics API

```bash
# Get current statistics
curl http://localhost:8005/api/turn/stats | jq

# Expected output:
{
  "totalConnections": 5,
  "activeConnections": 2,
  "totalAllocations": 3,
  "activeAllocations": 1,
  "totalBytes": 1048576,
  "stunRequests": 10,
  "turnRequests": 3,
  "errors": 0,
  "startTime": "2024-10-15T07:30:00.000Z",
  "uptime": 300000,
  "activeSessions": 2,
  "timestamp": "2024-10-15T07:35:00.000Z"
}
```

### 3. View Active Sessions

```bash
curl http://localhost:8005/api/turn/sessions | jq
```

### 4. TURN Server Admin UI

1. Open http://localhost:8080
2. Login with credentials from `turnserver.conf`
3. View real-time statistics and active sessions

## Frontend Integration

### Step 1: Copy the Helper

Copy `webrtc-helper.js` to your frontend src folder:

```bash
cp stun-turn-service/webrtc-helper.js frontend/src/utils/
```

### Step 2: Use in Your Component

```javascript
import { createPeerConnection, getTurnStats } from './utils/webrtc-helper';

function VideoCall() {
  const [peerConnection, setPeerConnection] = useState(null);
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    // Fetch TURN stats
    getTurnStats().then(setStats);
  }, []);

  const startCall = async () => {
    try {
      // Create peer connection with STUN/TURN config
      const pc = await createPeerConnection();
      setPeerConnection(pc);
      
      // Your WebRTC logic here
      // ...
      
    } catch (error) {
      console.error('Failed to start call:', error);
    }
  };
  
  return (
    <div>
      <button onClick={startCall}>Start Call</button>
      {stats && <div>Active TURN connections: {stats.activeConnections}</div>}
    </div>
  );
}
```

## Verifying Event Logging

### 1. Make a Test Call

1. Start the frontend: `cd frontend && npm start`
2. Open two browser windows
3. Login with different users
4. Start a video call

### 2. Check RabbitMQ for Events

```bash
# Using RabbitMQ CLI
docker exec -it rabbitmq rabbitmqadmin get queue=webrtc_events count=10

# Or via API
curl -u guest:guest http://localhost:15672/api/queues/%2F/webrtc_events
```

### 3. Expected Events

You should see events like:

```json
{
  "eventType": "connection_established",
  "service": "stun-turn-service",
  "details": {
    "sessionId": "001000000000000001",
    "username": "turnuser",
    "origin": "192.168.1.100:54321"
  },
  "timestamp": "2024-10-15T07:30:00.000Z"
}
```

```json
{
  "eventType": "turn_allocation_created",
  "service": "stun-turn-service",
  "details": {
    "sessionId": "001000000000000001",
    "session": {
      "username": "turnuser",
      "origin": "192.168.1.100:54321",
      "startTime": "2024-10-15T07:30:00.000Z"
    }
  },
  "timestamp": "2024-10-15T07:30:05.000Z"
}
```

## Troubleshooting

### No ICE Candidates Generated

**Problem**: No candidates appear when testing

**Solutions**:
1. Check if STUN/TURN service is running: `docker ps | grep stun-turn`
2. Verify ports are accessible: `netstat -an | grep 3478`
3. Check firewall: ensure UDP port 3478 is open
4. View logs: `docker logs stun-turn-service`

### TURN Relay Not Working

**Problem**: Only STUN candidates, no relay candidates

**Solutions**:
1. Verify TURN credentials are correct
2. Check UDP relay ports: `docker logs stun-turn-service | grep relay`
3. Ensure relay port range is open: 49152-49200/udp
4. Test with: `turnutils_uclient -v -u turnuser -w turnpassword localhost`

### Events Not Appearing in RabbitMQ

**Problem**: No events in webrtc_events queue

**Solutions**:
1. Check RabbitMQ connection: `docker logs stun-turn-service | grep RabbitMQ`
2. Verify queue exists: `curl -u guest:guest http://localhost:15672/api/queues`
3. Check for errors: `docker logs stun-turn-service | grep -i error`

### High CPU Usage

**Problem**: TURN server using too much CPU

**Solutions**:
1. Limit relay ports in docker-compose.yml (already limited to 49152-49200)
2. Adjust `max-bps` in turnserver.conf to limit bandwidth
3. Enable `no-tcp-relay` if only UDP is needed

## Performance Tuning

### For Production

Edit `turnserver.conf`:

```bash
# Limit bandwidth per session
max-bps=1000000

# Limit total bandwidth
bps-capacity=10000000

# Limit sessions per user
user-quota=10

# Enable rate limiting
total-quota=100
```

### Docker Resource Limits

Edit `docker-compose.yml`:

```yaml
stun-turn-service:
  # ... other config ...
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 1G
      reservations:
        cpus: '0.5'
        memory: 256M
```

## Security Checklist

- [ ] Change default TURN credentials in `turnserver.conf`
- [ ] Set proper `realm` to your domain
- [ ] Enable TLS for TURN (port 5349)
- [ ] Use time-limited credentials (`use-auth-secret`)
- [ ] Restrict relay to specific IP ranges
- [ ] Enable authentication for web admin
- [ ] Set up proper firewall rules
- [ ] Monitor for unusual traffic patterns

## Next Steps

1. ✅ STUN/TURN server is running
2. ✅ Events are logged to RabbitMQ
3. ✅ Statistics API is available
4. ⬜ Integrate into frontend application
5. ⬜ Set up monitoring dashboard
6. ⬜ Configure production security
7. ⬜ Test with real network scenarios (NAT, firewall)

## Useful Commands

```bash
# View all services
docker-compose ps

# Restart STUN/TURN service
docker-compose restart stun-turn-service

# View logs in real-time
docker-compose logs -f stun-turn-service

# Check resource usage
docker stats stun-turn-service

# Execute command in container
docker exec -it stun-turn-service sh

# Test RabbitMQ connection
docker exec -it rabbitmq rabbitmqadmin list queues
```

## Additional Resources

- [Coturn Configuration](https://github.com/coturn/coturn/wiki/turnserver)
- [WebRTC Samples](https://webrtc.github.io/samples/)
- [MDN WebRTC Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Trickle ICE Tool](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
