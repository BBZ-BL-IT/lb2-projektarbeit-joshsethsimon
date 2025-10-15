# Caddy SPA Routing Fix

## Problem

When accessing React Router routes like `/logs` or `/statistics` directly (or refreshing the page), Caddy was not serving the React app's index.html, causing 404 errors.

## Root Cause

The original Caddyfile used `handle_path /` which strips the path before proxying. This doesn't work well with SPAs that use client-side routing (React Router).

## Solution

Reordered and updated the Caddyfile to:

1. **Handle API routes first** - Specific routes like `/api/*` and `/ws/*` are matched before the catch-all
2. **Use catch-all for SPA** - `handle /*` proxies all unmatched routes to the frontend
3. **Proper order** - Most specific routes first, general routes last

## Updated Caddyfile Structure

```caddyfile
:80 {
    # 1. WebSocket (specific)
    handle /ws* {
        reverse_proxy chat-service:8001
    }

    # 2. API routes (specific)
    handle /api/chat/* {
        reverse_proxy chat-service:8001
    }
    handle /api/participants/* {
        reverse_proxy participant-service:8003
    }
    handle /api/logs/* {
        reverse_proxy log-service:8004
    }
    handle /api/turn/* {
        reverse_proxy stun-turn-service:8005
    }

    # 3. Other specific routes
    handle /turn-admin* {
        reverse_proxy stun-turn-service:8080
    }
    handle /static/* {
        reverse_proxy frontend:8000
    }

    # 4. Catch-all for SPA (least specific, comes last)
    handle /* {
        reverse_proxy frontend:8000
    }
}
```

## How It Works

### Request Flow

**API Request:**
```
Request: GET /api/turn/config
         ↓
Match: handle /api/turn/*
         ↓
Proxy to: stun-turn-service:8005
```

**SPA Route (logged in user):**
```
Request: GET /logs
         ↓
No match: /api/*, /ws/*, /static/*, /turn-admin*
         ↓
Match: handle /*
         ↓
Proxy to: frontend:8000
         ↓
Frontend serves: index.html
         ↓
React Router handles: /logs route
```

**Static File:**
```
Request: GET /static/js/main.js
         ↓
Match: handle /static/*
         ↓
Proxy to: frontend:8000
```

## Testing

### Test SPA Routes

```bash
# Start services
docker-compose up -d

# Test direct access to SPA routes
curl -I http://localhost/logs
curl -I http://localhost/statistics
curl -I http://localhost/

# All should return 200 OK with HTML content
```

### Test API Routes

```bash
# Test API routes still work
curl http://localhost/api/turn/config
curl http://localhost/api/chat/users
curl http://localhost/api/logs/recent

# All should return JSON
```

### Test in Browser

1. **Navigate normally:**
   - Go to http://localhost
   - Login
   - Click on "Logs" or "Statistics"
   - ✅ Should work

2. **Direct URL access:**
   - Go directly to http://localhost/logs
   - ✅ Should load the React app and show logs page

3. **Refresh page:**
   - Go to http://localhost/statistics
   - Press F5 to refresh
   - ✅ Should stay on statistics page (not 404)

## Route Priority

Caddy processes routes in order. Most specific routes should come first:

1. **Most Specific:** `/api/turn/config` (exact API endpoint)
2. **Specific:** `/api/turn/*` (API namespace)
3. **Less Specific:** `/static/*` (static files)
4. **Least Specific:** `/*` (catch-all for SPA)

## Common Issues

### Issue: API calls returning HTML instead of JSON

**Cause:** Catch-all route is matching before API routes

**Solution:** Ensure API routes are defined BEFORE the catch-all `/*`

### Issue: 404 on SPA routes

**Cause:** No catch-all route, or catch-all is using `handle_path`

**Solution:** Use `handle /*` (not `handle_path /`) as the last route

### Issue: Static files not loading

**Cause:** Catch-all is matching before `/static/*`

**Solution:** Define `/static/*` before the catch-all

## Key Changes

### Before (Broken)
```caddyfile
:80 {
    handle_path / {
        reverse_proxy frontend:8000
    }
    # ... other routes
}
```
❌ `/logs` would not match any route → 404

### After (Fixed)
```caddyfile
:80 {
    # API routes first
    handle /api/* { ... }
    
    # Catch-all for SPA (last)
    handle /* {
        reverse_proxy frontend:8000
    }
}
```
✅ `/logs` matches `/*` → proxies to frontend → React handles route

## Verification

After updating Caddyfile:

```bash
# Restart Caddy
docker-compose restart caddy

# Test SPA routes
curl http://localhost/logs        # Should return HTML
curl http://localhost/statistics  # Should return HTML

# Test API routes
curl http://localhost/api/turn/config  # Should return JSON

# Check Caddy config syntax
docker exec caddy caddy fmt /etc/caddy/Caddyfile
```

## Production Notes

For production with a domain:

```caddyfile
yourdomain.com {
    # Same route structure
    handle /api/* { ... }
    handle /* {
        reverse_proxy frontend:8000
    }
}
```

The catch-all ensures all SPA routes work with:
- Direct URL access
- Page refreshes
- Browser back/forward
- Deep linking

## Summary

✅ **Fixed:** SPA routes `/logs`, `/statistics` now work correctly
✅ **Method:** Reordered routes - specific first, catch-all last
✅ **Result:** All routes properly handled by React Router
✅ **Side effects:** None - API routes still work as expected

The Caddyfile now properly supports React SPA routing while maintaining all API and WebSocket functionality.
