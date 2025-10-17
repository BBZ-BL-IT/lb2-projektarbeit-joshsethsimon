import React from "react";
import {
  Paper,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  IconButton,
} from "@mui/material";
import { VideoCall, Close } from "@mui/icons-material";

function OnlineUsersPanel({ users, onStartCall, onClose }) {
  return (
    <Paper
      elevation={2}
      sx={{
        width: "280px",
        padding: "20px",
        borderRadius: "16px",
        background: "white",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        position: "relative",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: "#667eea",
          }}
        >
          🟢 Online Users ({users.length})
        </Typography>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{
            color: "#667eea",
            "&:hover": {
              backgroundColor: "rgba(102, 126, 234, 0.1)",
            },
          }}
        >
          <Close />
        </IconButton>
      </Box>
      <List dense>
        {users.map((user, index) => (
          <ListItem
            key={index}
            sx={{
              borderRadius: "8px",
              marginBottom: "8px",
              "&:hover": {
                background: "#f5f7fa",
              },
            }}
          >
            <ListItemText
              primary={user}
              primaryTypographyProps={{
                variant: "body2",
                fontWeight: 500,
              }}
            />
            <IconButton
              size="small"
              onClick={() => onStartCall(user)}
              title="Start Video Call"
              sx={{
                color: "#667eea",
                "&:hover": {
                  background: "rgba(102, 126, 234, 0.1)",
                },
              }}
            >
              <VideoCall fontSize="small" />
            </IconButton>
          </ListItem>
        ))}
        {users.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: "center", padding: "20px" }}
          >
            No other users online
          </Typography>
        )}
      </List>
    </Paper>
  );
}

export default OnlineUsersPanel;
