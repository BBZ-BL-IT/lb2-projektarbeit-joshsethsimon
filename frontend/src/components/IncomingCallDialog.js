import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from "@mui/material";

function IncomingCallDialog({ open, caller, onAccept, onDecline }) {
  return (
    <Dialog
      open={open}
      PaperProps={{
        sx: {
          borderRadius: "16px",
          padding: "8px",
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 600, color: "#667eea" }}>
        📞 Incoming Call
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: "16px", color: "#2c3e50" }}>
          <strong>{caller}</strong> is calling you...
        </Typography>
      </DialogContent>
      <DialogActions sx={{ padding: "16px" }}>
        <Button
          onClick={onDecline}
          sx={{
            borderRadius: "8px",
            textTransform: "none",
            fontWeight: 600,
            color: "#e74c3c",
            "&:hover": {
              background: "rgba(231, 76, 60, 0.1)",
            },
          }}
        >
          Decline
        </Button>
        <Button
          onClick={onAccept}
          variant="contained"
          sx={{
            borderRadius: "8px",
            textTransform: "none",
            fontWeight: 600,
            background: "linear-gradient(135deg, #27ae60 0%, #229954 100%)",
            boxShadow: "0 4px 15px rgba(39, 174, 96, 0.4)",
            "&:hover": {
              background: "linear-gradient(135deg, #229954 0%, #1e8449 100%)",
            },
          }}
        >
          Accept
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default IncomingCallDialog;
