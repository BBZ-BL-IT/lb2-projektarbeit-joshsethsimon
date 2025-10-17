# ICE Candidate Queuing Fix

## Issue Fixed

### Error
```
process.nextTick is not a function
```

### Problem
1. **Missing process.nextTick polyfill** - Simple-Peer uses `process.nextTick()` which doesn't exist in browsers
2. **ICE candidates arriving too early** - Caller sends ICE candidates immediately after offer, but callee hasn't created peer yet
3. **Candidates were being dropped** - "Received signal but no peer exists" warnings

## Solution Applied

### 1. Added process.nextTick Polyfill

**File:** `frontend/src/index.js`

```javascript
window.process = window.process || { 
  env: {},
  nextTick: function(fn) {
    setTimeout(fn, 0);
  }
};
```

This polyfills `process.nextTick()` to use `setTimeout(fn, 0)` which achieves the same async behavior in browsers.

### 2. ICE Candidate Queuing

**File:** `frontend/src/hooks/useWebRTC_simple_peer.js`

**Added:**
- `pendingCandidatesRef` - Queue to store ICE candidates received before peer is ready
- Queue candidates when they arrive before peer exists
- Process all queued candidates after peer is created

**Flow:**
1. Caller sends offer + ICE candidates
2. Callee receives offer → stores it
3. Callee receives ICE candidates → **queues them** (new!)
4. User clicks "Accept"
5. Callee creates peer and signals offer
6. **Processes all queued ICE candidates** (new!)
7. Connection established

## Changes Made

### frontend/src/index.js
```javascript
// Added nextTick polyfill
window.process = window.process || { 
  env: {},
  nextTick: function(fn) {
    setTimeout(fn, 0);
  }
};
```

### frontend/src/hooks/useWebRTC_simple_peer.js

**1. Added pending candidates queue:**
```javascript
const pendingCandidatesRef = useRef([]);
```

**2. Updated handleSignal to queue candidates:**
```javascript
if (!peerRef.current) {
  if (data.signal?.type === 'offer') {
    // Store offer
  } else if (!data.signal?.type) {
    // Queue ICE candidate
    pendingCandidatesRef.current.push(data.signal);
  }
}
```

**3. Process queued candidates in acceptCall:**
```javascript
// After creating peer and signaling offer
if (pendingCandidatesRef.current.length > 0) {
  console.log(`Processing ${pendingCandidatesRef.current.length} queued ICE candidates`);
  pendingCandidatesRef.current.forEach(candidate => {
    peer.signal(candidate);
  });
  pendingCandidatesRef.current = [];
}
```

**4. Clear queue in handleCallEnd:**
```javascript
pendingCandidatesRef.current = [];
```

## Expected Console Output

### Successful Call Flow

**Caller:**
```
=== STARTING CALL ===
Target: UserB
[Caller] Sending signal: offer
[Caller] Sending signal: (ICE candidates...)
Received signal from: UserB Type: answer
Received remote stream
Peer connected!
```

**Callee:**
```
Received signal from: UserA Type: offer
Storing offer for incoming call
Received signal from: UserA Type: candidate
Queuing ICE candidate for when peer is ready
Received signal from: UserA Type: candidate
Queuing ICE candidate for when peer is ready
... (more candidates)
=== ACCEPTING CALL ===
From: UserA
Signaling incoming offer to peer
Processing 15 queued ICE candidates  ← NEW!
[Callee] Sending signal: answer
Received remote stream
Peer connected!
```

## Why This Happens

### ICE Candidate Timing

1. **Caller creates peer** → immediately starts gathering ICE candidates
2. **Candidates are sent as they're discovered** (trickle ICE)
3. **Callee receives offer** → stores it, shows dialog
4. **Callee receives ICE candidates** → but peer doesn't exist yet!
5. **User clicks Accept** → peer is created
6. **Queued candidates are processed** → connection completes

### Why Queue Is Needed

Without queuing:
- ❌ ICE candidates arrive before peer exists
- ❌ Candidates are ignored/dropped
- ❌ Connection may fail or be slow
- ❌ Console full of warnings

With queuing:
- ✅ ICE candidates are stored
- ✅ All candidates processed when peer is ready
- ✅ Faster, more reliable connections
- ✅ Clean console output

## Testing

1. Hard refresh browser (Ctrl+Shift+R)
2. Start a video call
3. Check console - should see:
   - ✅ "Queuing ICE candidate for when peer is ready"
   - ✅ "Processing X queued ICE candidates"
   - ✅ No "process.nextTick is not a function" error
   - ✅ "Received remote stream"
   - ✅ "Peer connected!"

## Troubleshooting

### Still seeing process.nextTick error?
- Hard refresh (Ctrl+Shift+R)
- Clear cache completely
- Restart dev server

### Candidates still being dropped?
- Check console for queue messages
- Verify pendingCandidatesRef is working
- Check peer is created before processing

### Connection still fails?
- Verify STUN/TURN servers accessible
- Check both users have media permissions
- Try forcing Google STUN servers

---

**Status:** ✅ Fixed
**Date:** October 17, 2024
**Files Changed:** 2
