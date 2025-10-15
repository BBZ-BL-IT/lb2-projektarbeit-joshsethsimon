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
  Collapse,
  Tooltip,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";
import {
  Refresh,
  ArrowBack,
  History,
  FilterList,
  AccessTime,
  ExpandMore,
  ExpandLess,
  Phone,
  Chat,
  Wifi,
  Error as ErrorIcon,
  CheckCircle,
  Info,
} from "@mui/icons-material";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL || "";

// Function to format timestamps
const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

// Function to get action color based on event type
const getActionColor = (action, eventType) => {
  const event = action || eventType;
  const colorMap = {
    // WebSocket events
    connection: "info",
    user_join: "success",
    user_joined: "success",
    user_disconnected: "error",
    user_left: "error",
    typing_start: "default",
    
    // Chat events
    message_sent: "primary",
    
    // WebRTC call events
    call_initiated: "info",
    call_answered: "success",
    call_ended: "warning",
    call_disconnected: "error",
    call_failed: "error",
    ice_candidate_exchange: "default",
    
    // TURN/STUN events
    connection_established: "success",
    turn_allocation_created: "info",
    turn_channel_bind: "default",
    turn_permission_created: "default",
    connection_closed: "warning",
    stun_binding_request: "info",
    turn_error: "error",
    turn_refresh: "default",
    data_transfer: "default",
    
    // System
    service_started: "success",
    login: "success",
    logout: "default",
  };
  return colorMap[event] || "default";
};

// Function to get category icon
const getCategoryIcon = (category, action, eventType) => {
  const cat = category || (action && action.includes('call') ? 'webrtc' : 'websocket');
  
  switch (cat) {
    case 'webrtc':
      return <Phone fontSize="small" />;
    case 'websocket':
      return <Wifi fontSize="small" />;
    case 'system':
      return <Info fontSize="small" />;
    default:
      if (eventType?.includes('error')) {
        return <ErrorIcon fontSize="small" />;
      }
      return <Chat fontSize="small" />;
  }
};

// Function to get service badge color
const getServiceColor = (service) => {
  const colorMap = {
    'chat-service': 'primary',
    'stun-turn-service': 'secondary',
    'log-service': 'default',
    'participant-service': 'info',
    'webrtc-system': 'warning',
  };
  return colorMap[service] || 'default';
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
  const [expandedRow, setExpandedRow] = useState(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterService, setFilterService] = useState("all");

  const loadLogs = async (currentPage = page + 1, limit = rowsPerPage) => {
    setLoading(true);
    setError("");

    try {
      // Build query params
      let queryParams = `page=${currentPage}&limit=${limit}`;
      
      if (filterCategory !== "all") {
        queryParams += `&category=${filterCategory}`;
      }
      
      if (filterService !== "all") {
        queryParams += `&service=${filterService}`;
      }
      
      // Load logs
      const logsRes = await axios.get(`${API_URL}/api/logs?${queryParams}`);
      console.log("Logs Response:", logsRes.data);
      
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
  }, [filterCategory, filterService]);

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

  const handleExpandRow = (logId) => {
    setExpandedRow(expandedRow === logId ? null : logId);
  };

  const renderDetails = (log) => {
    if (!log.details || Object.keys(log.details).length === 0) {
      return <Typography variant="caption" color="textSecondary">No additional details</Typography>;
    }

    return (
      <Box>
        <Typography variant="subtitle2" gutterBottom>Details:</Typography>
        <Box component="pre" sx={{ 
          backgroundColor: '#f5f5f5', 
          padding: 1, 
          borderRadius: 1,
          fontSize: '0.75rem',
          overflow: 'auto',
          maxHeight: '200px'
        }}>
          {JSON.stringify(log.details, null, 2)}
        </Box>
      </Box>
    );
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

      {/* Filters */}
      <Paper style={{ padding: "20px", marginBottom: "20px" }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Category</InputLabel>
              <Select
                value={filterCategory}
                label="Category"
                onChange={(e) => {
                  setFilterCategory(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="all">All Categories</MenuItem>
                <MenuItem value="websocket">WebSocket</MenuItem>
                <MenuItem value="webrtc">WebRTC</MenuItem>
                <MenuItem value="system">System</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Service</InputLabel>
              <Select
                value={filterService}
                label="Service"
                onChange={(e) => {
                  setFilterService(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="all">All Services</MenuItem>
                <MenuItem value="chat-service">Chat Service</MenuItem>
                <MenuItem value="stun-turn-service">STUN/TURN Service</MenuItem>
                <MenuItem value="log-service">Log Service</MenuItem>
                <MenuItem value="participant-service">Participant Service</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Button
              variant="outlined"
              startIcon={<FilterList />}
              onClick={() => {
                setFilterCategory("all");
                setFilterService("all");
                setPage(0);
              }}
              fullWidth
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

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
                            label={action._id || 'unknown'}
                            color={getActionColor(action._id, action._id)}
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
                <TableCell width="30px"></TableCell>
                <TableCell><strong>Timestamp</strong></TableCell>
                <TableCell><strong>Event</strong></TableCell>
                <TableCell><strong>Category</strong></TableCell>
                <TableCell><strong>Service</strong></TableCell>
                <TableCell><strong>Username</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs && logs.length > 0 ? (
                logs.map((log) => {
                  const eventName = log.eventType || log.action || 'unknown';
                  const isExpanded = expandedRow === log._id;
                  
                  return (
                    <React.Fragment key={log._id}>
                      <TableRow hover onClick={() => handleExpandRow(log._id)} style={{ cursor: 'pointer' }}>
                        <TableCell>
                          <IconButton size="small">
                            {isExpanded ? <ExpandLess /> : <ExpandMore />}
                          </IconButton>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatTimestamp(log.timestamp)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            {getCategoryIcon(log.category, log.action, log.eventType)}
                            <Chip
                              label={eventName}
                              color={getActionColor(log.action, log.eventType)}
                              size="small"
                            />
                          </Box>
                        </TableCell>
                        <TableCell>
                          {log.category && (
                            <Chip 
                              label={log.category} 
                              size="small" 
                              variant="outlined"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {log.service && (
                            <Chip 
                              label={log.service} 
                              color={getServiceColor(log.service)}
                              size="small" 
                              variant="outlined"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {log.username || '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box margin={2}>
                              {renderDetails(log)}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center">
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
