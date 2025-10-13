import React, { useState, useEffect } from "react";
import {
  Container,
  Paper,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
} from "@mui/material";
import {
  Refresh,
  People,
  Message,
  Assessment,
  TrendingUp,
  ArrowBack,
} from "@mui/icons-material";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL || "";

function Statistics() {
  const navigate = useNavigate();
  const [chatStats, setChatStats] = useState(null);
  const [participantStats, setParticipantStats] = useState(null);
  const [logStats, setLogStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStatistics = async () => {
    setLoading(true);
    setError("");
    
    try {
      const [chatRes, participantRes, logRes] = await Promise.all([
        axios.get(`${API_URL}/api/chat/stats`),
        axios.get(`${API_URL}/api/participants/stats`),
        axios.get(`${API_URL}/api/logs/stats`),
      ]);

      setChatStats(chatRes.data);
      setParticipantStats(participantRes.data.stats);
      setLogStats(logRes.data.stats);
    } catch (err) {
      console.error("Failed to load statistics:", err);
      setError("Failed to load statistics. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatistics();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadStatistics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !chatStats) {
    return (
      <Container maxWidth="lg" style={{ marginTop: "40px", textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="body1" style={{ marginTop: "20px" }}>
          Loading statistics...
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" style={{ marginTop: "20px" }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom="20px">
        <Box display="flex" alignItems="center" gap="10px">
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => navigate('/')}
          >
            Back to Chat
          </Button>
          <Typography variant="h4" component="h1">
            Application Statistics
          </Typography>
        </Box>
        <IconButton color="primary" onClick={loadStatistics} title="Refresh Statistics">
          <Refresh />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" style={{ marginBottom: "20px" }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* User Statistics */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" marginBottom="10px">
                <People color="primary" style={{ marginRight: "10px" }} />
                <Typography variant="h6">Users</Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {participantStats?.totalUsers || 0}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Total Users
              </Typography>
              <Box marginTop="15px">
                <Typography variant="body2">
                  Online: <strong>{participantStats?.onlineUsers || 0}</strong>
                </Typography>
                <Typography variant="body2">
                  Offline: <strong>{participantStats?.offlineUsers || 0}</strong>
                </Typography>
                <Typography variant="body2">
                  Active (24h): <strong>{participantStats?.recentlyActive || 0}</strong>
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Message Statistics */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" marginBottom="10px">
                <Message color="primary" style={{ marginRight: "10px" }} />
                <Typography variant="h6">Messages</Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {chatStats?.totalMessages || 0}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Total Messages
              </Typography>
              <Box marginTop="15px">
                <Typography variant="body2">
                  Last 24h: <strong>{chatStats?.messagesLast24h || 0}</strong>
                </Typography>
                <Typography variant="body2">
                  Connected Now: <strong>{chatStats?.totalConnections || 0}</strong>
                </Typography>
                <Typography variant="body2">
                  Active Calls: <strong>{chatStats?.activeCalls || 0}</strong>
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Activity Logs Statistics */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" marginBottom="10px">
                <Assessment color="primary" style={{ marginRight: "10px" }} />
                <Typography variant="h6">Activity Logs</Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {logStats?.totalLogs || 0}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Total Logs
              </Typography>
              <Box marginTop="15px">
                <Typography variant="body2">
                  Last 24h: <strong>{logStats?.logsLast24h || 0}</strong>
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Most Active Users */}
        <Grid item xs={12} md={6}>
          <Paper style={{ padding: "20px" }}>
            <Box display="flex" alignItems="center" marginBottom="15px">
              <TrendingUp color="primary" style={{ marginRight: "10px" }} />
              <Typography variant="h6">Most Active Users</Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Rank</strong></TableCell>
                    <TableCell><strong>Username</strong></TableCell>
                    <TableCell align="right"><strong>Messages</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {chatStats?.mostActiveUsers && chatStats.mostActiveUsers.length > 0 ? (
                    chatStats.mostActiveUsers.map((user, index) => (
                      <TableRow key={user._id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{user._id}</TableCell>
                        <TableCell align="right">{user.count}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        No data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Action Breakdown */}
        <Grid item xs={12} md={6}>
          <Paper style={{ padding: "20px" }}>
            <Box display="flex" alignItems="center" marginBottom="15px">
              <Assessment color="primary" style={{ marginRight: "10px" }} />
              <Typography variant="h6">Activity Breakdown</Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Action</strong></TableCell>
                    <TableCell align="right"><strong>Count</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logStats?.actionBreakdown && logStats.actionBreakdown.length > 0 ? (
                    logStats.actionBreakdown.map((action) => (
                      <TableRow key={action._id}>
                        <TableCell>{action._id}</TableCell>
                        <TableCell align="right">{action.count}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2} align="center">
                        No data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Currently Online Users */}
        <Grid item xs={12}>
          <Paper style={{ padding: "20px" }}>
            <Typography variant="h6" gutterBottom>
              Currently Online Users ({chatStats?.connectedUsers?.length || 0})
            </Typography>
            <Box display="flex" flexWrap="wrap" gap="10px" marginTop="15px">
              {chatStats?.connectedUsers && chatStats.connectedUsers.length > 0 ? (
                chatStats.connectedUsers.map((user, index) => (
                  <Card key={index} style={{ minWidth: "150px" }}>
                    <CardContent style={{ padding: "10px" }}>
                      <Typography variant="body2">
                        <People fontSize="small" style={{ verticalAlign: "middle", marginRight: "5px" }} />
                        {user}
                      </Typography>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Typography variant="body2" color="textSecondary">
                  No users currently online
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Typography variant="caption" color="textSecondary" style={{ display: "block", marginTop: "20px", textAlign: "center" }}>
        Last updated: {chatStats?.timestamp ? new Date(chatStats.timestamp).toLocaleString() : "N/A"}
        {" • Auto-refresh every 30 seconds"}
      </Typography>
    </Container>
  );
}

export default Statistics;
