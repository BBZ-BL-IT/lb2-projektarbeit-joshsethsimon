import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Button,
  Box,
  Typography,
} from "@mui/material";
import {
  CallEnd,
  Mic,
  MicOff,
  Videocam,
  VideocamOff,
} from "@mui/icons-material";

function VideoCallDialog({
  open,
  currentCallTarget,
  localVideoRef,
  remoteVideoRef,
  isMuted,
  isVideoEnabled,
  onToggleMute,
  onToggleVideo,
  onEndCall,
  isCallActive,
}) {
  return (
    <Dialog
      open={open}
      maxWidth="md"
      fullWidth
      onClose={() => !isCallActive && onEndCall()}
      PaperProps={{
        sx: {
          borderRadius: "16px",
          background: "#1a1a1a",
        },
      }}
    >
      <DialogTitle
        sx={{
          fontWeight: 600,
          color: "white",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        🎥 Video Call {currentCallTarget && `with ${currentCallTarget}`}
      </DialogTitle>
      <DialogContent sx={{ background: "#1a1a1a", padding: "24px" }}>
        <Box display="flex" gap={3} justifyContent="center" flexWrap="wrap">
          <Box textAlign="center">
            <Typography
              variant="subtitle2"
              sx={{
                color: "white",
                marginBottom: "8px",
                fontWeight: 600,
              }}
            >
              You
            </Typography>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: "320px",
                height: "240px",
                border: "2px solid #667eea",
                borderRadius: "12px",
                backgroundColor: "#000",
                objectFit: "cover",
              }}
            />
          </Box>
          <Box textAlign="center">
            <Typography
              variant="subtitle2"
              sx={{
                color: "white",
                marginBottom: "8px",
                fontWeight: 600,
              }}
            >
              {currentCallTarget || "Remote"}
            </Typography>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{
                width: "320px",
                height: "240px",
                border: "2px solid #667eea",
                borderRadius: "12px",
                backgroundColor: "#000",
                objectFit: "cover",
              }}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions
        sx={{
          background: "#1a1a1a",
          padding: "16px",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <IconButton
          onClick={onToggleMute}
          sx={{
            color: isMuted ? "#e74c3c" : "white",
            background: isMuted
              ? "rgba(231, 76, 60, 0.2)"
              : "rgba(255,255,255,0.1)",
            "&:hover": {
              background: isMuted
                ? "rgba(231, 76, 60, 0.3)"
                : "rgba(255,255,255,0.2)",
            },
          }}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff /> : <Mic />}
        </IconButton>
        <IconButton
          onClick={onToggleVideo}
          sx={{
            color: !isVideoEnabled ? "#e74c3c" : "white",
            background: !isVideoEnabled
              ? "rgba(231, 76, 60, 0.2)"
              : "rgba(255,255,255,0.1)",
            "&:hover": {
              background: !isVideoEnabled
                ? "rgba(231, 76, 60, 0.3)"
                : "rgba(255,255,255,0.2)",
            },
          }}
          title={!isVideoEnabled ? "Enable Video" : "Disable Video"}
        >
          {!isVideoEnabled ? <VideocamOff /> : <Videocam />}
        </IconButton>
        <Button
          onClick={onEndCall}
          variant="contained"
          startIcon={<CallEnd />}
          sx={{
            borderRadius: "8px",
            textTransform: "none",
            fontWeight: 600,
            background: "#e74c3c",
            marginLeft: "8px",
            "&:hover": {
              background: "#c0392b",
            },
          }}
        >
          End Call
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default VideoCallDialog;
