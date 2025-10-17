import React, { useRef, useEffect } from "react";
import {
  Paper,
  Box,
  Typography,
  TextField,
  Button,
} from "@mui/material";
import { Send } from "@mui/icons-material";

function ChatPanel({
  messages,
  username,
  newMessage,
  setNewMessage,
  onSendMessage,
  onTyping,
  typingUsers,
  socketConnected,
  loading,
}) {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  return (
    <Paper
      elevation={2}
      sx={{
        flexGrow: 1,
        padding: "20px",
        borderRadius: "16px",
        background: "white",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          height: "500px",
          overflow: "auto",
          marginBottom: "20px",
          padding: "16px",
          borderRadius: "12px",
          bgcolor: "#f8f9fa",
          border: "1px solid #e9ecef",
          "&::-webkit-scrollbar": {
            width: "8px",
          },
          "&::-webkit-scrollbar-track": {
            background: "#f1f1f1",
            borderRadius: "10px",
          },
          "&::-webkit-scrollbar-thumb": {
            background: "#888",
            borderRadius: "10px",
            "&:hover": {
              background: "#555",
            },
          },
        }}
      >
        {loading && (
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ padding: "20px" }}
          >
            Loading messages...
          </Typography>
        )}
        {messages.map((msg, index) => (
          <Box
            key={msg._id || index}
            sx={{
              marginBottom: "16px",
              padding: "12px",
              borderRadius: "12px",
              background: msg.username === username ? "#e3f2fd" : "white",
              border: "1px solid",
              borderColor:
                msg.username === username ? "#90caf9" : "#e0e0e0",
              maxWidth: "70%",
              marginLeft: msg.username === username ? "auto" : "0",
              marginRight: msg.username === username ? "0" : "auto",
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                color: "#667eea",
                fontWeight: 600,
                marginBottom: "4px",
              }}
            >
              {msg.username}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                wordBreak: "break-word",
                color: "#2c3e50",
                lineHeight: 1.5,
              }}
            >
              {msg.message}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "#95a5a6",
                display: "block",
                marginTop: "4px",
              }}
            >
              {new Date(msg.timestamp).toLocaleTimeString()}
            </Typography>
          </Box>
        ))}

        {typingUsers.length > 0 && (
          <Box sx={{ marginBottom: "10px", paddingLeft: "12px" }}>
            <Typography
              variant="caption"
              sx={{
                color: "#95a5a6",
                fontStyle: "italic",
              }}
            >
              {typingUsers.join(", ")}{" "}
              {typingUsers.length === 1 ? "is" : "are"} typing...
            </Typography>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      <Box display="flex" gap={2}>
        <TextField
          fullWidth
          multiline
          maxRows={3}
          placeholder="Type your message..."
          value={newMessage}
          onChange={onTyping}
          onKeyPress={handleKeyPress}
          disabled={!socketConnected}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: "12px",
              background: "#f8f9fa",
            },
          }}
        />
        <Button
          variant="contained"
          onClick={onSendMessage}
          disabled={!newMessage.trim() || !socketConnected}
          sx={{
            borderRadius: "12px",
            minWidth: "100px",
            textTransform: "none",
            fontWeight: 600,
            background:
              "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            boxShadow: "0 4px 15px rgba(102, 126, 234, 0.4)",
            "&:hover": {
              background:
                "linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)",
              boxShadow: "0 6px 20px rgba(102, 126, 234, 0.6)",
            },
          }}
          startIcon={<Send />}
        >
          Send
        </Button>
      </Box>
      {!socketConnected && (
        <Typography
          variant="caption"
          color="error"
          sx={{ marginTop: "8px", textAlign: "center" }}
        >
          ⚠️ Disconnected from server
        </Typography>
      )}
    </Paper>
  );
}

export default ChatPanel;
