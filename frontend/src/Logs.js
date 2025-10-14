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
  Chip,
  TablePagination,
} from "@mui/material";
import {
  Refresh,
  ArrowBack,
  History,
  FilterList,
  AccessTime,
} from "@mui/icons-material";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL || "";

// Function to format timestamps
const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

// Function to get action color
const getActionColor = (action) => {
  const colorMap = {
    user_joined: "success",
    user_left: "error",
    message_sent: "primary",
    call_started: "info",
    call_ended: "warning",
    login: "success",
    logout: "default",
  };
  return colorMap[action] || "default";
};

function Logs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalLogs, setTotalLogs] = useState(0);

  const loadLogs = async (currentPage = page + 1, limit = rowsPerPage) => {
    setLoading(true);
    setError("");

    try {
      // For testing: Load logs first
      const logsRes = await axios.get(`${API_URL}/api/logs?page=${currentPage}&limit=${limit}`);
      console.log("Logs Response Full:", logsRes);
      console.log("Logs Response Data:", logsRes.data);
      console.log("Logs Response Data Type:", typeof logsRes.data);
      console.log("Logs Response Data.logs:", logsRes.data?.logs);
      
      // Check if response is valid
      if (logsRes.data) {
        // Handle case where data might be a string
        let data = logsRes.data;
        if (typeof data === 'string' && data.trim() !== '') {
          try {
            data = JSON.parse(data);
          } catch (e) {
            console.error("Failed to parse logs response:", e);
          }
        }
        
        if (data && data.logs && Array.isArray(data.logs)) {
          setLogs(data.logs);
          setTotalLogs(data.total || data.logs.length);
          console.log(`Setting ${data.logs.length} logs`);
        } else {
          console.log("No logs array found in response. Data:", data);
          setLogs([]);
          setTotalLogs(0);
        }
      } else {
        console.log("No data in logs response");
        setLogs([]);
        setTotalLogs(0);
      }

      // Then load stats
      try {
        const statsRes = await axios.get(`${API_URL}/api/logs/stats`);
        console.log("Stats Response:", statsRes.data);
        if (statsRes.data && statsRes.data.stats) {
          setStats(statsRes.data.stats);
        }
      } catch (statsErr) {
        console.error("Failed to load stats (non-critical):", statsErr);
        // Don't fail the whole page if stats fail
      }
    } catch (err) {
      console.error("Failed to load logs:", err);
      setError(`Failed to load logs: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(1, rowsPerPage);
  }, []);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
    loadLogs(newPage + 1, rowsPerPage);
  };

  const handleChangeRowsPerPage = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPage(0);
    loadLogs(1, newRowsPerPage);
  };

  const handleRefresh = () => {
    loadLogs(page + 1, rowsPerPage);
  };

  if (loading && logs.length === 0) {
    return (
      <Container maxWidth="lg" style={{ marginTop: "40px", textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="body1" style={{ marginTop: "20px" }}>
          Loading logs...
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
            onClick={() => navigate("/")}
          >
            Back to Chat
          </Button>
          <Typography variant="h4" component="h1">
            Activity Logs
          </Typography>
        </Box>
        <IconButton color="primary" onClick={handleRefresh} title="Refresh Logs">
          <Refresh />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" style={{ marginBottom: "20px" }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={3} style={{ marginBottom: "30px" }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" marginBottom="10px">
                <History color="primary" style={{ marginRight: "10px" }} />
                <Typography variant="h6">Total Logs</Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {stats?.totalLogs || 0}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                All time activity logs
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" marginBottom="10px">
                <AccessTime color="primary" style={{ marginRight: "10px" }} />
                <Typography variant="h6">Last 24 Hours</Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {stats?.logsLast24h || 0}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Recent activity
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" marginBottom="10px">
                <FilterList color="primary" style={{ marginRight: "10px" }} />
                <Typography variant="h6">Action Types</Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {stats?.actionBreakdown?.length || 0}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Different action types
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Action Breakdown */}
      <Grid container spacing={3} style={{ marginBottom: "30px" }}>
        <Grid item xs={12} md={6}>
          <Paper style={{ padding: "20px" }}>
            <Typography variant="h6" gutterBottom>
              Action Breakdown
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Action</strong></TableCell>
                    <TableCell align="right"><strong>Count</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats?.actionBreakdown && stats.actionBreakdown.length > 0 ? (
                    stats.actionBreakdown.map((action) => (
                      <TableRow key={action._id}>
                        <TableCell>
                          <Chip
                            label={action._id}
                            color={getActionColor(action._id)}
                            size="small"
                          />
                        </TableCell>
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

        <Grid item xs={12} md={6}>
          <Paper style={{ padding: "20px", height: "100%" }}>
            <Typography variant="h6" gutterBottom>
              Log Retention
            </Typography>
            <Box marginTop="20px">
              <Alert severity="info">
                <Typography variant="body2">
                  Logs are automatically deleted after 6 hours to manage storage.
                </Typography>
                <Typography variant="body2" style={{ marginTop: "10px" }}>
                  Current logs: <strong>{totalLogs}</strong>
                </Typography>
                <Typography variant="body2">
                  Showing page: <strong>{page + 1}</strong> of{" "}
                  <strong>{Math.ceil(totalLogs / rowsPerPage)}</strong>
                </Typography>
              </Alert>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Logs Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Timestamp</strong></TableCell>
                <TableCell><strong>Action</strong></TableCell>
                <TableCell><strong>Username</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs && logs.length > 0 ? (
                logs.map((log) => (
                  <TableRow key={log._id} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {formatTimestamp(log.timestamp)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.action}
                        color={getActionColor(log.action)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {log.username}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    <Typography variant="body2" color="textSecondary">
                      No logs found
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={totalLogs}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 20, 50, 100]}
        />
      </Paper>

      <Typography
        variant="caption"
        color="textSecondary"
        style={{ display: "block", marginTop: "20px", textAlign: "center" }}
      >
        Logs are updated in real-time and automatically expire after 6 hours
      </Typography>
    </Container>
  );
}

export default Logs;
