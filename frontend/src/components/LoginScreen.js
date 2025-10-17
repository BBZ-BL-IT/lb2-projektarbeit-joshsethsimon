import React from "react";
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
} from "@mui/material";

function LoginScreen({ username, setUsername, onLogin, loading, error }) {
  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      onLogin();
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "20px",
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={6}
          sx={{
            padding: "40px",
            borderRadius: "16px",
            textAlign: "center",
            backdropFilter: "blur(10px)",
            background: "rgba(255, 255, 255, 0.95)",
          }}
        >
          <Typography
            variant="h3"
            gutterBottom
            sx={{
              fontWeight: 700,
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: "10px",
            }}
          >
            Chat App
          </Typography>
          <Typography
            variant="subtitle1"
            color="text.secondary"
            sx={{ marginBottom: "30px" }}
          >
            Connect and communicate instantly
          </Typography>
          {error && (
            <Alert
              severity="error"
              sx={{ marginBottom: "24px", borderRadius: "8px" }}
            >
              {error}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={handleKeyPress}
            sx={{
              marginBottom: "24px",
              "& .MuiOutlinedInput-root": {
                borderRadius: "12px",
              },
            }}
            disabled={loading}
            error={!!error}
            helperText="3-20 characters, letters/numbers/underscore/hyphen only"
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              marginBottom: "16px",
              textAlign: "center",
            }}
          >
            💡 Your username will be saved for next time
          </Typography>
          <Button
            variant="contained"
            onClick={onLogin}
            fullWidth
            disabled={loading}
            sx={{
              padding: "12px",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: 600,
              textTransform: "none",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              boxShadow: "0 4px 15px rgba(102, 126, 234, 0.4)",
              "&:hover": {
                background:
                  "linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)",
                boxShadow: "0 6px 20px rgba(102, 126, 234, 0.6)",
              },
            }}
          >
            {loading ? "Joining..." : "Join Chat"}
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}

export default LoginScreen;
