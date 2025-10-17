# Frontend Component Quick Reference

## Component Import Guide

### Using Components

```javascript
// In App.js or other components
import ChatHeader from './components/ChatHeader';
import ChatPanel from './components/ChatPanel';
import OnlineUsersPanel from './components/OnlineUsersPanel';
import VideoCallDialog from './components/VideoCallDialog';
import IncomingCallDialog from './components/IncomingCallDialog';
import LoginScreen from './components/LoginScreen';
```

### Using the WebRTC Hook

```javascript
import { useWebRTC } from './hooks/useWebRTC';

function MyComponent() {
  const [socket, setSocket] = useState(null);
  
  // Initialize WebRTC functionality
  const webrtc = useWebRTC(socket);
  
  // Access WebRTC state and functions
  const {
    isCallActive,
    incomingCall,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    localVideoRef,
    remoteVideoRef
  } = webrtc;
  
  // Use in your component
  return (
    <VideoCallDialog
      open={webrtc.callDialogOpen}
      currentCallTarget={webrtc.currentCallTarget}
      localVideoRef={webrtc.localVideoRef}
      remoteVideoRef={webrtc.remoteVideoRef}
      isMuted={webrtc.isMuted}
      isVideoEnabled={webrtc.isVideoEnabled}
      onToggleMute={webrtc.toggleMute}
      onToggleVideo={webrtc.toggleVideo}
      onEndCall={webrtc.endCall}
      isCallActive={webrtc.isCallActive}
    />
  );
}
```

## Component Props Reference

### ChatHeader
```javascript
<ChatHeader
  username={string}                    // Current user's username
  turnServiceAvailable={boolean}       // TURN server status
  hideSystemMessages={boolean}         // Filter state
  onNavigateStatistics={function}      // Navigate to stats page
  onNavigateLogs={function}            // Navigate to logs page
  onNavigateTurnStats={function}       // Navigate to TURN stats
  onRefresh={function}                 // Refresh chat data
  onToggleSystemMessages={function}    // Toggle system message filter
  onLogout={function}                  // Logout handler
/>
```

### ChatPanel
```javascript
<ChatPanel
  messages={array}                     // Array of message objects
  username={string}                    // Current user's username
  newMessage={string}                  // Current input value
  setNewMessage={function}             // Set input value
  onSendMessage={function}             // Send message handler
  onTyping={function}                  // Typing event handler
  typingUsers={array}                  // Array of typing usernames
  socketConnected={boolean}            // WebSocket status
  loading={boolean}                    // Loading state
/>
```

### OnlineUsersPanel
```javascript
<OnlineUsersPanel
  users={array}                        // Array of online usernames
  onStartCall={function}               // Start call handler (username) => void
  onClose={function}                   // Close panel handler
/>
```

### VideoCallDialog
```javascript
<VideoCallDialog
  open={boolean}                       // Dialog visibility
  currentCallTarget={string}           // Target user's username
  localVideoRef={ref}                  // Ref for local video element
  remoteVideoRef={ref}                 // Ref for remote video element
  isMuted={boolean}                    // Audio mute state
  isVideoEnabled={boolean}             // Video enabled state
  onToggleMute={function}              // Toggle mute handler
  onToggleVideo={function}             // Toggle video handler
  onEndCall={function}                 // End call handler
  isCallActive={boolean}               // Call active state
/>
```

### IncomingCallDialog
```javascript
<IncomingCallDialog
  open={boolean}                       // Dialog visibility
  caller={string}                      // Caller's username
  onAccept={function}                  // Accept call handler
  onDecline={function}                 // Decline call handler
/>
```

### LoginScreen
```javascript
<LoginScreen
  username={string}                    // Username input value
  setUsername={function}               // Set username
  onLogin={function}                   // Login handler
  loading={boolean}                    // Loading state
  error={string}                       // Error message
/>
```

## WebRTC Hook API

### State Properties
```javascript
isCallActive          // boolean - Whether a call is currently active
incomingCall          // object|null - Incoming call data {from, offer}
isMuted               // boolean - Audio mute status
isVideoEnabled        // boolean - Video enabled status
callDialogOpen        // boolean - Video dialog visibility
currentCallTarget     // string|null - Current call participant username
```

### Refs
```javascript
localVideoRef         // React ref - Attach to local <video> element
remoteVideoRef        // React ref - Attach to remote <video> element
```

### Functions
```javascript
startCall(username)   // Initiate a call to a user
acceptCall()          // Accept an incoming call
declineCall()         // Decline an incoming call
endCall()             // End the current call
handleCallEnd()       // Internal cleanup handler
toggleMute()          // Toggle microphone mute
toggleVideo()         // Toggle camera on/off
```

### WebRTC Event Handlers
```javascript
handleCallOffer(data)      // Handle incoming call offer from socket
handleCallAnswer(data)     // Handle call answer from socket
handleIceCandidate(data)   // Handle ICE candidate from socket
```

## Message Object Structure

```javascript
{
  _id: string,           // MongoDB document ID
  username: string,      // Sender username (or "SYSTEM")
  message: string,       // Message content
  timestamp: Date,       // Message timestamp
  room: string          // Chat room (default: "general")
}
```

## Example: Custom Component Using WebRTC

```javascript
import React, { useState } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import VideoCallDialog from './components/VideoCallDialog';
import IncomingCallDialog from './components/IncomingCallDialog';

function CustomVideoChat({ socket, users }) {
  const webrtc = useWebRTC(socket);
  
  return (
    <div>
      <h2>Online Users</h2>
      <ul>
        {users.map(user => (
          <li key={user}>
            {user}
            <button onClick={() => webrtc.startCall(user)}>
              Call
            </button>
          </li>
        ))}
      </ul>
      
      {/* Call dialogs */}
      <IncomingCallDialog
        open={!!webrtc.incomingCall}
        caller={webrtc.incomingCall?.from}
        onAccept={webrtc.acceptCall}
        onDecline={webrtc.declineCall}
      />
      
      <VideoCallDialog
        open={webrtc.callDialogOpen}
        currentCallTarget={webrtc.currentCallTarget}
        localVideoRef={webrtc.localVideoRef}
        remoteVideoRef={webrtc.remoteVideoRef}
        isMuted={webrtc.isMuted}
        isVideoEnabled={webrtc.isVideoEnabled}
        onToggleMute={webrtc.toggleMute}
        onToggleVideo={webrtc.toggleVideo}
        onEndCall={webrtc.endCall}
        isCallActive={webrtc.isCallActive}
      />
    </div>
  );
}
```

## File Organization

```
frontend/src/
├── App.js                    # Main application container
├── components/               # Reusable UI components
│   ├── ChatHeader.js
│   ├── ChatPanel.js
│   ├── IncomingCallDialog.js
│   ├── LoginScreen.js
│   ├── OnlineUsersPanel.js
│   └── VideoCallDialog.js
├── hooks/                    # Custom React hooks
│   └── useWebRTC.js         # WebRTC functionality
├── pages/                    # Page components
│   ├── Logs.js
│   ├── Statistics.js
│   └── TurnStats.js
└── utils/                    # Utility functions
    └── webrtc-helper.js
```

## Common Tasks

### Adding a New Component
1. Create file in `src/components/ComponentName.js`
2. Import React and required Material-UI components
3. Define props interface
4. Implement component
5. Export default

### Modifying WebRTC Behavior
1. Edit `src/hooks/useWebRTC.js`
2. Modify initialization, handlers, or state
3. Update return object if adding new exports
4. Components using the hook automatically get updates

### Customizing Chat UI
1. Edit relevant component in `src/components/`
2. Modify Material-UI `sx` props for styling
3. Add/remove UI elements as needed
4. Props remain the same for compatibility

### Adding WebSocket Events
1. Add event listener in `App.js` useEffect
2. Handle event with state update or function call
3. Pass data to components via props if needed
4. For WebRTC events, use `webrtc.handleEventName`
