# STUN/TURN Service

This service provides STUN/TURN server functionality for WebRTC connections and logs all connection events to RabbitMQ.

## Features

- **STUN Server**: Provides NAT traversal support on port 3478
- **TURN Server**: Relay server for WebRTC when direct peer-to-peer connection fails
- **Event Logging**: All connection events are logged to RabbitMQ queues (`logs` and `webrtc_events`)
- **Statistics API**: Real-time statistics about connections and data transfer
- **Health Monitoring**: Health check endpoint for service monitoring

## Ports

- **3478/UDP**: STUN/TURN server port
- **3478/TCP**: STUN/TURN server port (TCP)
- **5349/TCP**: TURN server TLS port
- **49152-65535/UDP**: TURN relay port range
- **8005**: HTTP API for statistics and configuration
- **8080**: TURN server web admin interface

## API Endpoints

### Health Check
```
GET /health
```

### Get Statistics
```
GET /api/turn/stats
```
Returns:
- Total connections
- Active connections
- Total allocations
- STUN/TURN request counts
- Data transfer statistics

### Get Active Sessions
```
GET /api/turn/sessions
```
Returns list of active WebRTC sessions with details.

### Get TURN Configuration
```
GET /api/turn/config
```
Returns ICE server configuration for WebRTC clients.

### Test Event (Development)
```
POST /api/turn/test-event
```
Manually trigger a log event to RabbitMQ.

## WebRTC Client Configuration

To use this STUN/TURN server in your WebRTC application:

```javascript
const iceServers = [
  { urls: 'stun:localhost:3478' },
  {
    urls: [
      'turn:localhost:3478',
      'turn:localhost:3478?transport=tcp'
    ],
    username: 'turnuser',
    credential: 'turnpassword'
  }
];

const peerConnection = new RTCPeerConnection({ iceServers });
```

## RabbitMQ Events

Events are published to two queues:

### `webrtc_events` Queue
- `connection_established`: New WebRTC connection
- `turn_allocation_created`: TURN relay allocated
- `connection_closed`: Connection terminated
- `turn_error`: Error occurred
- `service_started`: Service started

### `logs` Queue
All events are also logged to the general logs queue for centralized logging.

## Environment Variables

- `PORT`: HTTP API port (default: 8005)
- `RABBITMQ_URL`: RabbitMQ connection URL (default: amqp://guest:guest@rabbitmq:5672)
- `TURN_SERVER_HOST`: Public hostname for TURN server (default: localhost)

## Credentials

**Default credentials** (change in production):
- Username: `turnuser`
- Password: `turnpassword`

For production, update the `turnserver.conf` file with secure credentials and use database authentication.
