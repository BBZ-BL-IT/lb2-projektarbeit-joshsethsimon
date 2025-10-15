import React, { useState, useEffect } from "react";
import {
  Container,
  Paper,
  Typography,
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
} from "@mui/material";
import {
  ArrowBack,
  Refresh,
  CheckCircle,
  Warning,
  NetworkCheck,
  DataUsage,
  Timer,
  People,
  Error as ErrorIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "";

function TurnStats() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const loadStats = async () => {
    try {
      setLoading(true);
      setError("");

      const [statsRes, sessionsRes, configRes] = await Promise.all([
        axios.get(`${API_URL}/api/turn/stats`),
        axios.get(`${API_URL}/api/turn/sessions`),
        axios.get(`${API_URL}/api/turn/config`),
      ]);

      setStats(statsRes.data);
      setSessions(sessionsRes.data.sessions || []);
      setConfig(configRes.data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to load TURN stats:", err);
      setError("Failed to load TURN/STUN statistics. Service may be unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const StatCard = ({ title, value, icon, color = "#667eea", subtitle }) => (
    <Card
      elevation={2}
      sx={{
        height: "100%",
        background: "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)",
        borderLeft: `4px solid ${color}`,
      }}
    >
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              backgroundColor: `${color}20`,
              borderRadius: "50%",
              padding: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f7fa" }}>
      <AppBar
        position="static"
        elevation={0}
        sx={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => navigate("/")}
            sx={{
              marginRight: 2,
              "&:hover": {
                background: "rgba(255, 255, 255, 0.1)",
              },
            }}
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            🌐 STUN/TURN Server Statistics
          </Typography>
          <Chip
            icon={stats && !error ? <CheckCircle /> : <Warning />}
            label={stats && !error ? "Service Active" : "Service Unavailable"}
            size="small"
            color={stats && !error ? "success" : "error"}
            sx={{
              marginRight: 2,
              fontWeight: 500,
            }}
          />
          <IconButton
            color="inherit"
            onClick={loadStats}
            title="Refresh"
            sx={{
              "&:hover": {
                background: "rgba(255, 255, 255, 0.1)",
              },
            }}
          >
            <Refresh />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ marginTop: "30px", marginBottom: "30px" }}>
        {error && (
          <Alert
            severity="error"
            sx={{
              marginBottom: "20px",
              borderRadius: "12px",
            }}
            onClose={() => setError("")}
          >
            {error}
          </Alert>
        )}

        {loading && !stats ? (
          <Box textAlign="center" padding="50px">
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ marginTop: 2 }}>
              Loading statistics...
            </Typography>
          </Box>
        ) : stats ? (
          <>
            <Box marginBottom={3}>
              <Typography variant="body2" color="text.secondary">
                Last updated: {lastUpdate.toLocaleTimeString()} • Auto-refreshing every 5 seconds
              </Typography>
            </Box>

            {/* Statistics Cards */}
            <Grid container spacing={3} marginBottom={4}>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Active Connections"
                  value={stats.activeConnections}
                  icon={<People sx={{ fontSize: 32, color: "#667eea" }} />}
                  color="#667eea"
                  subtitle={`${stats.totalConnections} total`}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Active Allocations"
                  value={stats.activeAllocations}
                  icon={<NetworkCheck sx={{ fontSize: 32, color: "#27ae60" }} />}
                  color="#27ae60"
                  subtitle={`${stats.totalAllocations} total`}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Data Transferred"
                  value={formatBytes(stats.totalBytes)}
                  icon={<DataUsage sx={{ fontSize: 32, color: "#3498db" }} />}
                  color="#3498db"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Server Uptime"
                  value={formatDuration(stats.uptime)}
                  icon={<Timer sx={{ fontSize: 32, color: "#f39c12" }} />}
                  color="#f39c12"
                  subtitle={`Started ${new Date(stats.startTime).toLocaleString()}`}
                />
              </Grid>
            </Grid>

            {/* Request Statistics */}
            <Grid container spacing={3} marginBottom={4}>
              <Grid item xs={12} sm={4}>
                <StatCard
                  title="STUN Requests"
                  value={stats.stunRequests}
                  icon={<NetworkCheck sx={{ fontSize: 28, color: "#9b59b6" }} />}
                  color="#9b59b6"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <StatCard
                  title="TURN Requests"
                  value={stats.turnRequests}
                  icon={<NetworkCheck sx={{ fontSize: 28, color: "#e67e22" }} />}
                  color="#e67e22"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <StatCard
                  title="Errors"
                  value={stats.errors}
                  icon={<ErrorIcon sx={{ fontSize: 28, color: "#e74c3c" }} />}
                  color="#e74c3c"
                />
              </Grid>
            </Grid>

            {/* Server Configuration */}
            {config && (
              <Paper
                elevation={2}
                sx={{
                  padding: "24px",
                  borderRadius: "16px",
                  marginBottom: 3,
                  background: "white",
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    marginBottom: 2,
                    color: "#667eea",
                  }}
                >
                  🔧 Server Configuration
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ padding: 2, background: "#f8f9fa", borderRadius: "8px" }}>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        STUN Server
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                        {config.stunServer}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ padding: 2, background: "#f8f9fa", borderRadius: "8px" }}>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        TURN Server URLs
                      </Typography>
                      {config.turnServer.urls.map((url, index) => (
                        <Typography
                          key={index}
                          variant="body2"
                          sx={{ fontFamily: "monospace" }}
                        >
                          {url}
                        </Typography>
                      ))}
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            )}

            {/* Active Sessions */}
            <Paper
              elevation={2}
              sx={{
                padding: "24px",
                borderRadius: "16px",
                background: "white",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 600,
                  marginBottom: 2,
                  color: "#667eea",
                }}
              >
                👥 Active Sessions ({sessions.length})
              </Typography>
              {sessions.length > 0 ? (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Session ID</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Username</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Origin</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Realm</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sessions.map((session) => (
                        <TableRow key={session.sessionId}>
                          <TableCell sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                            {session.sessionId}
                          </TableCell>
                          <TableCell>{session.username}</TableCell>
                          <TableCell sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                            {session.origin}
                          </TableCell>
                          <TableCell>{session.realm}</TableCell>
                          <TableCell>{formatDuration(session.duration)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Box
                  sx={{
                    padding: "40px",
                    textAlign: "center",
                    background: "#f8f9fa",
                    borderRadius: "12px",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    No active sessions at the moment
                  </Typography>
                </Box>
              )}
            </Paper>
          </>
        ) : null}
      </Container>
    </Box>
  );
}

export default TurnStats;
