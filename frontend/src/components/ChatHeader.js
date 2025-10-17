import React, { useState, useEffect } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Chip,
  Tooltip,
} from "@mui/material";
import {
  Refresh,
  BarChart,
  Logout,
  History,
  CheckCircle,
  Warning,
  FilterAlt,
  FilterAltOff,
  Dns,
  Cloud,
} from "@mui/icons-material";

function ChatHeader({
  username,
  turnServiceAvailable,
  hideSystemMessages,
  onNavigateStatistics,
  onNavigateLogs,
  onNavigateTurnStats,
  onRefresh,
  onToggleSystemMessages,
  onLogout,
}) {
  const [forceGoogleStun, setForceGoogleStun] = useState(() => {
    return localStorage.getItem('forceGoogleStun') === 'true';
  });

  const toggleGoogleStun = () => {
    const newValue = !forceGoogleStun;
    setForceGoogleStun(newValue);
    localStorage.setItem('forceGoogleStun', newValue.toString());
    
    // Show notification
    const message = newValue 
      ? '🌐 Forcing Google STUN servers - Reload to apply'
      : '🔄 Auto-detect STUN/TURN - Reload to apply';
    
    if (window.alert) {
      alert(message);
    }
  };

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
      }}
    >
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
          💬 Chat App - Welcome, {username}
        </Typography>
        <Tooltip
          title={
            turnServiceAvailable
              ? "STUN/TURN server active - Click to view stats"
              : "Using fallback public STUN servers - Click to view stats"
          }
          arrow
        >
          <Chip
            icon={turnServiceAvailable ? <CheckCircle /> : <Warning />}
            label={turnServiceAvailable ? "TURN Active" : "Fallback STUN"}
            size="small"
            color={turnServiceAvailable ? "success" : "warning"}
            onClick={onNavigateTurnStats}
            sx={{
              marginRight: 2,
              fontWeight: 500,
              cursor: "pointer",
              "&:hover": {
                opacity: 0.8,
              },
              "& .MuiChip-icon": {
                color: "inherit",
              },
            }}
          />
        </Tooltip>
        <IconButton
          color="inherit"
          onClick={onNavigateStatistics}
          title="View Statistics"
          sx={{
            "&:hover": {
              background: "rgba(255, 255, 255, 0.1)",
            },
          }}
        >
          <BarChart />
        </IconButton>
        <IconButton
          color="inherit"
          onClick={onNavigateLogs}
          title="View Logs"
          sx={{
            "&:hover": {
              background: "rgba(255, 255, 255, 0.1)",
            },
          }}
        >
          <History />
        </IconButton>
        <IconButton
          color="inherit"
          onClick={onRefresh}
          title="Refresh"
          sx={{
            "&:hover": {
              background: "rgba(255, 255, 255, 0.1)",
            },
          }}
        >
          <Refresh />
        </IconButton>
        <Tooltip
          title={hideSystemMessages ? "Show system messages" : "Hide system messages"}
          arrow
        >
          <IconButton
            color="inherit"
            onClick={onToggleSystemMessages}
            sx={{
              "&:hover": {
                background: "rgba(255, 255, 255, 0.1)",
              },
            }}
          >
            {hideSystemMessages ? <FilterAltOff /> : <FilterAlt />}
          </IconButton>
        </Tooltip>
        <Tooltip
          title={forceGoogleStun ? "Using Google STUN only (click to auto-detect)" : "Auto-detect STUN/TURN (click to force Google)"}
          arrow
        >
          <IconButton
            color="inherit"
            onClick={toggleGoogleStun}
            sx={{
              "&:hover": {
                background: "rgba(255, 255, 255, 0.1)",
              },
              backgroundColor: forceGoogleStun ? "rgba(255, 255, 255, 0.2)" : "transparent",
            }}
          >
            {forceGoogleStun ? <Cloud /> : <Dns />}
          </IconButton>
        </Tooltip>
        <IconButton
          color="inherit"
          onClick={onLogout}
          title="Logout"
          sx={{
            "&:hover": {
              background: "rgba(255, 255, 255, 0.1)",
            },
          }}
        >
          <Logout />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}

export default ChatHeader;
