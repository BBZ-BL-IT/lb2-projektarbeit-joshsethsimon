# Force Google STUN Servers Feature

## Overview
Added ability to force the use of Google's public STUN servers instead of auto-detecting STUN/TURN configuration.

## Why This Feature?

Sometimes you may want to:
- **Bypass custom TURN server** if it's having issues
- **Test with only Google STUN** to verify connectivity
- **Avoid TURN server costs** during development/testing
- **Troubleshoot connection issues** by using known-good servers

## How to Use

### Method 1: UI Toggle Button (Easiest)

1. Look at the top navigation bar
2. Find the **DNS/Cloud icon** (near the logout button)
3. Click it to toggle between:
   - **DNS icon** 🔧 = Auto-detect (uses TURN if available)
   - **Cloud icon** ☁️ = Force Google STUN only
4. **Refresh the page** for changes to take effect

### Method 2: Browser Console

```javascript
// Force Google STUN only
localStorage.setItem('forceGoogleStun', 'true');
location.reload();

// Auto-detect (default)
localStorage.setItem('forceGoogleStun', 'false');
location.reload();

// Check current setting
console.log('Force Google STUN:', localStorage.getItem('forceGoogleStun'));
```

### Method 3: Environment Variable

Add to your `.env` file:
```bash
REACT_APP_FORCE_GOOGLE_STUN=true
```

Then rebuild:
```bash
npm run build
```

## Server Priority

When **Force Google STUN is OFF** (default):
1. ✅ Check if custom TURN server is available
2. ✅ If available, use: Custom TURN + Google STUN
3. ✅ If not available, fallback to: Google STUN servers

When **Force Google STUN is ON**:
1. ✅ Always use: Google STUN servers only
2. ✅ Skip TURN server detection
3. ✅ Faster connection setup (no TURN check delay)

## Google STUN Servers Used

```javascript
{
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" }
  ]
}
```

## Console Messages

Look for these in browser console:

**Force Google STUN:**
```
🌐 Forcing Google STUN servers
```

**Custom TURN Server:**
```
🔄 Using custom TURN server
```

**Fallback:**
```
📡 Using fallback Google STUN servers
```

## When to Use Each Mode

### Use Force Google STUN When:
- ✅ Custom TURN server is down
- ✅ Testing basic connectivity
- ✅ TURN server has authentication issues
- ✅ You want faster connection setup
- ✅ Debugging connection problems

### Use Auto-Detect When:
- ✅ Behind restrictive NAT/firewall
- ✅ Need relay server for difficult networks
- ✅ Production environment
- ✅ Custom TURN server is working properly

## Troubleshooting

### Connections fail with Force Google STUN
**Problem:** Google STUN alone can't establish connection
**Solution:** 
- Turn off Force Google STUN
- Make sure custom TURN server is running
- Check TURN server credentials

### UI button not responding
**Problem:** Click doesn't seem to work
**Solution:**
- Check browser console for errors
- Hard refresh (Ctrl+Shift+R)
- Try Method 2 (console) instead

### Setting not persisting
**Problem:** Resets after page reload
**Solution:**
- Check browser allows localStorage
- Clear browser cache
- Check for browser extensions blocking storage

## Code Changes

### Files Modified:

1. **frontend/src/hooks/useWebRTC_simple_peer.js**
   - Updated `getIceServers()` function
   - Checks `localStorage.getItem('forceGoogleStun')`
   - Checks `process.env.REACT_APP_FORCE_GOOGLE_STUN`
   - Returns appropriate STUN/TURN config

2. **frontend/src/components/ChatHeader.js**
   - Added state for `forceGoogleStun`
   - Added toggle button with DNS/Cloud icons
   - Added tooltip with current status
   - Persists setting to localStorage

## API

### localStorage Key
```
Key: 'forceGoogleStun'
Values: 'true' | 'false'
```

### Environment Variable
```
REACT_APP_FORCE_GOOGLE_STUN=true
```

## Testing

1. **Test Force Google STUN:**
   ```
   1. Click DNS/Cloud icon (should show Cloud)
   2. Refresh page
   3. Start video call
   4. Check console: should see "🌐 Forcing Google STUN servers"
   5. Call should work (if both users have open NAT)
   ```

2. **Test Auto-Detect:**
   ```
   1. Click DNS/Cloud icon (should show DNS)
   2. Refresh page
   3. Start video call
   4. Check console: should see TURN status message
   5. Call should work even with restrictive NAT
   ```

## Limitations

- **Google STUN only works** when both users have relatively open NAT
- **Cannot traverse symmetric NAT** without TURN relay
- **May fail in corporate networks** with strict firewalls
- **No bandwidth optimization** that TURN provides

## Best Practices

1. **Development:** Use Force Google STUN for faster testing
2. **Production:** Use Auto-Detect to ensure reliability
3. **Troubleshooting:** Toggle between modes to isolate issues
4. **Documentation:** Tell users when to use which mode

---

**Added:** October 17, 2024
**Status:** ✅ Active
**UI Location:** Top navigation bar (DNS/Cloud icon)
