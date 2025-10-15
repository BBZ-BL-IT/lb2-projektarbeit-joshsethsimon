# Caddy Proxy Integration for STUN/TURN Service

## Overview

The STUN/TURN service has been integrated into the Caddy reverse proxy, making it accessible through the standard HTTP port (80) alongside other services.

## Proxy Routes

### Added Routes in Caddyfile

```caddyfile
# STUN/TURN service API routes
handle /api/turn/* {
    reverse_proxy stun-turn-service:8005
}

# STUN/TURN web admin interface
handle /turn-admin* {
    reverse_proxy stun-turn-service:8080
}
```

## Access Points

### Through Proxy (Port 80) - **Recommended**

| Endpoint | Proxied URL | Direct URL | Description |
|----------|-------------|------------|-------------|
| Config API | `http://localhost/api/turn/config` | `http://localhost:8005/api/turn/config` | ICE server configuration |
| Stats API | `http://localhost/api/turn/stats` | `http://localhost:8005/api/turn/stats` | Server statistics |
| Sessions API | `http://localhost/api/turn/sessions` | `http://localhost:8005/api/turn/sessions` | Active sessions |
| Health Check | `http://localhost/api/turn/health` | `http://localhost:8005/health` | Service health |
| Web Admin | `http://localhost/turn-admin` | `http://localhost:8080` | Admin interface |

### Direct Access (Development Only)

The service is also directly accessible on port 8005 for development/debugging:
- `http://localhost:8005/api/turn/*`
- `http://localhost:8080` (Web admin)

## Frontend Configuration

### Updated Environment Variables

The frontend now uses **relative URLs** that go through the Caddy proxy:

```bash
# frontend/.env
REACT_APP_TURN_CONFIG_URL=/api/turn/config
REACT_APP_TURN_STATS_URL=/api/turn/stats
```

**Benefits:**
- ✅ No hardcoded ports
- ✅ Works in any environment
- ✅ Single entry point (port 80)
- ✅ Easier production deployment

### Configuration Options

#### Option 1: Proxy (Default - Recommended)
```bash
REACT_APP_TURN_CONFIG_URL=/api/turn/config
```
→ Goes through Caddy on port 80

#### Option 2: Direct Access (Development)
```bash
REACT_APP_TURN_CONFIG_URL=http://localhost:8005/api/turn/config
```
→ Bypasses proxy, direct to service

#### Option 3: Production
```bash
REACT_APP_TURN_CONFIG_URL=https://yourdomain.com/api/turn/config
```
→ Your production domain

## Complete Routing Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Browser (Port 80)                  │
└─────────────────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────┐
│              Caddy Reverse Proxy (:80)              │
├─────────────────────────────────────────────────────┤
│  /                    → frontend:8000               │
│  /ws/*                → chat-service:8001           │
│  /api/chat/*          → chat-service:8001           │
│  /api/participants/*  → participant-service:8003    │
│  /api/logs/*          → log-service:8004            │
│  /api/turn/*          → stun-turn-service:8005  ✨  │
│  /turn-admin*         → stun-turn-service:8080  ✨  │
└─────────────────────────────────────────────────────┘
```

## Testing

### Test Proxy Routes

```bash
# Start all services
docker-compose up -d

# Test through proxy (port 80)
curl http://localhost/api/turn/config
curl http://localhost/api/turn/stats
curl http://localhost/api/turn/health

# Test direct access (port 8005)
curl http://localhost:8005/api/turn/config

# Web admin through proxy
open http://localhost/turn-admin

# Web admin direct
open http://localhost:8080
```

### Verify Frontend Integration

```bash
# 1. Check frontend .env uses proxy routes
cat frontend/.env | grep TURN

# Expected:
# REACT_APP_TURN_CONFIG_URL=/api/turn/config
# REACT_APP_TURN_STATS_URL=/api/turn/stats

# 2. Start frontend
cd frontend && npm start

# 3. Open browser console
# Should see: "Using STUN/TURN configuration from server"
# Config should come from /api/turn/config (port 80)
```

### Test Status Indicator

1. Open frontend: `http://localhost:8000` (or through proxy: `http://localhost`)
2. Look for status chip in app bar
3. Should show: **"✓ TURN Active"** (green)
4. Hover for tooltip

## Proxy Benefits

### 1. Single Entry Point
- All services accessible through port 80
- No need to expose multiple ports
- Simplified firewall rules

### 2. Production Ready
- Easy SSL/TLS termination at proxy level
- Add HTTPS with Caddy auto-certificates
- Domain-based routing

### 3. Development Friendly
- No hardcoded URLs in frontend
- Works in Docker and local development
- Easy environment switching

### 4. Security
- Services isolated from direct access
- Proxy can add authentication
- Rate limiting possible at proxy level

## Production Deployment

### With SSL/TLS

Update `Caddyfile`:

```caddyfile
yourdomain.com {
    # Automatic HTTPS
    
    handle_path / {
        reverse_proxy frontend:8000
    }
    
    handle /api/turn/* {
        reverse_proxy stun-turn-service:8005
    }
    
    # ... other routes
}
```

Update frontend `.env`:
```bash
REACT_APP_TURN_CONFIG_URL=https://yourdomain.com/api/turn/config
```

Or use relative URLs (works automatically):
```bash
REACT_APP_TURN_CONFIG_URL=/api/turn/config
```

## Troubleshooting

### Issue: 502 Bad Gateway on /api/turn/*

**Cause:** STUN/TURN service not running

**Solution:**
```bash
docker-compose ps | grep stun-turn
docker-compose restart stun-turn-service
docker logs stun-turn-service
```

### Issue: Frontend shows "Fallback STUN" even when service is running

**Cause:** Frontend can't reach /api/turn/config

**Solution:**
```bash
# Test proxy route
curl http://localhost/api/turn/config

# Check Caddy logs
docker logs caddy

# Verify frontend .env
cat frontend/.env | grep TURN
```

### Issue: CORS errors when accessing /api/turn/*

**Cause:** CORS headers not properly configured

**Solution:** The stun-turn-service already includes CORS support. If issues persist, update Caddyfile:

```caddyfile
handle /api/turn/* {
    reverse_proxy stun-turn-service:8005 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

## Service Endpoints Summary

### API Endpoints (Through Proxy)

**Configuration:**
- `GET /api/turn/config` - Get ICE server configuration
- `GET /api/turn/stats` - Get server statistics  
- `GET /api/turn/sessions` - Get active sessions
- `GET /api/turn/health` - Health check
- `POST /api/turn/test-event` - Trigger test event (dev only)

**Web Interface:**
- `GET /turn-admin` - Web admin interface

### Example Usage

```javascript
// Frontend automatically uses proxy routes
import { getWebRTCConfig } from './utils/webrtc-helper';

// Fetches from /api/turn/config (port 80, through Caddy)
const config = await getWebRTCConfig();

// Returns:
{
  iceServers: [
    { urls: "stun:localhost:3478" },
    {
      urls: ["turn:localhost:3478"],
      username: "turnuser",
      credential: "turnpassword"
    }
  ]
}
```

## Updated Files

1. **proxy/Caddyfile** - Added TURN service routes
2. **frontend/.env** - Updated to use proxy routes
3. **frontend/.env.example** - Updated with options
4. **frontend/src/utils/webrtc-helper.js** - Default to relative URLs

## Complete URL Mapping

| What | Port 80 (Proxy) | Direct Port | Service |
|------|-----------------|-------------|---------|
| Frontend | `http://localhost/` | `http://localhost:8000` | frontend:8000 |
| WebSocket | `http://localhost/ws/` | `http://localhost:8001` | chat-service:8001 |
| Chat API | `http://localhost/api/chat/` | `http://localhost:8001` | chat-service:8001 |
| Participants | `http://localhost/api/participants/` | `http://localhost:8003` | participant-service:8003 |
| Logs API | `http://localhost/api/logs/` | `http://localhost:8004` | log-service:8004 |
| **TURN Config** | `http://localhost/api/turn/config` | `http://localhost:8005/api/turn/config` | stun-turn-service:8005 |
| **TURN Stats** | `http://localhost/api/turn/stats` | `http://localhost:8005/api/turn/stats` | stun-turn-service:8005 |
| **TURN Admin** | `http://localhost/turn-admin` | `http://localhost:8080` | stun-turn-service:8080 |

## Quick Commands

```bash
# Test proxy integration
curl http://localhost/api/turn/config | jq
curl http://localhost/api/turn/stats | jq

# Compare with direct access
curl http://localhost:8005/api/turn/config | jq

# Check Caddy routes
docker exec caddy caddy fmt /etc/caddy/Caddyfile

# View Caddy logs
docker logs caddy -f

# Restart Caddy after config changes
docker-compose restart caddy
```

## Summary

✅ **Caddy proxy fully configured for STUN/TURN service**
✅ **All endpoints accessible through port 80**
✅ **Frontend uses relative URLs (proxy-aware)**
✅ **Direct access still available for development**
✅ **Production-ready configuration**
✅ **SPA routing fix applied** - `/logs` and `/statistics` routes work correctly

**Note:** The Caddyfile uses a catch-all route (`handle /*`) as the last route to support React SPA routing. This allows direct access to routes like `/logs` and `/statistics` and enables page refresh without 404 errors. See `SPA_ROUTING_FIX.md` for details.

The STUN/TURN service is now properly integrated into your proxy architecture, accessible through the standard HTTP port alongside all other services.
