# System Messages Hiding - Fix Documentation

## Problem
After refactoring the monolithic App.js into separate components, the "hide system messages" feature stopped working. The toggle button existed in the header but clicking it had no visible effect.

## Root Cause Analysis

### Before (Monolithic App.js)
```javascript
// State
const [hideSystemMessages, setHideSystemMessages] = useState(...)

// WebSocket handlers (had closure issue)
newSocket.on("message", (data) => {
  if (hideSystemMessages && data.username === 'SYSTEM') {
    return prev;  // Filter on receive
  }
  return [...prev, data];
});

// Rendering (in same file)
{messages.map((msg) => <Message ... />)}
```

### After Refactoring (Broken)
```javascript
// App.js - State and WebSocket
const [hideSystemMessages, setHideSystemMessages] = useState(...)
// Passed to ChatHeader ✓
// NOT passed to ChatPanel ✗

// ChatPanel.js - Rendering
function ChatPanel({ messages }) {
  // No hideSystemMessages prop!
  {messages.map((msg) => <Message ... />)}
}
```

## Solution

### Architecture Decision
Store all messages in state, filter only on display. This provides:
- ✅ Instant toggle response (no server reload)
- ✅ No closure issues in WebSocket handlers
- ✅ Simpler state management
- ✅ Better separation of concerns

### Implementation

#### 1. Updated ChatPanel Component
```javascript
// Added prop
function ChatPanel({
  messages,
  hideSystemMessages = false,  // NEW
  ...
}) {
  // Filter messages for display only
  const displayedMessages = hideSystemMessages 
    ? messages.filter(msg => msg.username !== 'SYSTEM')
    : messages;
  
  // Render filtered messages
  {displayedMessages.map((msg) => (
    <Box
      sx={{
        // Added visual distinction for SYSTEM messages
        background: msg.username === 'SYSTEM' ? "#fff3cd" : "white",
        borderColor: msg.username === 'SYSTEM' ? "#ffc107" : "#e0e0e0",
      }}
    >
      <Typography
        sx={{
          color: msg.username === 'SYSTEM' ? "#856404" : "#667eea",
        }}
      >
        {msg.username}
      </Typography>
      ...
    </Box>
  ))}
}
```

#### 2. Updated App.js
```javascript
// Removed filtering from WebSocket handlers
newSocket.on("message", (data) => {
  setMessages((prev) => [...prev, data]);  // Store ALL messages
});

// Pass prop to ChatPanel
<ChatPanel
  messages={messages}
  hideSystemMessages={hideSystemMessages}  // NEW
  ...
/>

// Toggle function
const toggleSystemMessages = () => {
  const newValue = !hideSystemMessages;
  setHideSystemMessages(newValue);
  localStorage.setItem('hideSystemMessages', newValue.toString());
  // No need to reload - filtering happens in ChatPanel
};
```

## Files Modified

### frontend/src/components/ChatPanel.js
**Lines changed:**
- Line 11: Added `hideSystemMessages` prop parameter
- Line 24-26: Added `displayedMessages` filtering logic
- Line 87: Changed `messages.map` to `displayedMessages.map`
- Lines 94-97: Added conditional styling for SYSTEM messages (yellow background)
- Lines 104-108: Added conditional text color for SYSTEM messages

### frontend/src/App.js
**Lines changed:**
- Line 160-163: Simplified `message` WebSocket handler (removed filtering)
- Line 169-172: Simplified `new_message` WebSocket handler (removed filtering)
- Line 239: Removed `hideSystemMessages` from WebSocket useEffect dependencies
- Line 363-367: Updated `toggleSystemMessages` with explanatory comment
- Line 483: Added `hideSystemMessages` prop to ChatPanel

## Testing Checklist

### Manual Testing
- [ ] Login to the application
- [ ] Open the chat (should see system messages by default)
- [ ] Click the filter icon in the header (🔽 FilterAlt)
- [ ] Verify system messages disappear immediately
- [ ] Click the filter icon again (🔼 FilterAltOff)
- [ ] Verify system messages reappear immediately
- [ ] Refresh the page
- [ ] Verify the setting persists (messages stay hidden/shown)
- [ ] Send some chat messages (regular messages should always appear)
- [ ] Have another user join (system message should respect filter setting)

### Visual Verification
When system messages are visible, they should:
- Have a yellow/cream background (#fff3cd)
- Have a yellow border (#ffc107)
- Have brown/amber text color (#856404)
- Still show timestamp and message content

### Expected Behavior
1. **Toggle ON (hiding messages)**: System messages (username: 'SYSTEM') disappear from view
2. **Toggle OFF (showing messages)**: All messages including system messages are visible
3. **Persistence**: Setting survives page refresh (stored in localStorage)
4. **Performance**: Toggle is instant (no loading, no API call)
5. **Real-time**: New incoming system messages respect current filter setting

## Benefits of This Approach

### Performance
- No server roundtrip when toggling
- Instant visual feedback
- All messages pre-loaded in memory

### Maintainability
- Clear separation: filtering logic in display component
- No closure issues in WebSocket handlers
- Single source of truth for messages

### User Experience
- Immediate response to toggle
- Persistent preference across sessions
- Visual distinction for system messages
- No loading states or delays

## Common Issues & Solutions

### Issue: System messages still showing
**Check:**
1. Is `hideSystemMessages` prop being passed to ChatPanel?
2. Is the prop value actually changing when toggle is clicked?
3. Check browser console for any React errors

### Issue: Messages disappear when toggle clicked
**Check:**
1. Ensure filtering condition is `msg.username !== 'SYSTEM'`
2. Verify system messages have username field set to 'SYSTEM'
3. Check that regular messages don't have username 'SYSTEM'

### Issue: Setting doesn't persist
**Check:**
1. localStorage.setItem is called in toggleSystemMessages
2. Initial state reads from localStorage correctly
3. localStorage is available in browser (not disabled)

## Future Enhancements

Potential improvements:
- [ ] Add more filter options (filter by user, date range, etc.)
- [ ] Allow regex/pattern matching for filtering
- [ ] Add search functionality
- [ ] Export filtered message history
- [ ] Different visual themes for different message types

## Related Files
- `frontend/src/components/ChatHeader.js` - Contains toggle button
- `frontend/src/components/ChatPanel.js` - Renders filtered messages
- `frontend/src/App.js` - Manages state and WebSocket
- `frontend/src/hooks/useWebRTC.js` - WebRTC logic (unaffected)
