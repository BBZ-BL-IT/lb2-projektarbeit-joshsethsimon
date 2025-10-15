#!/bin/sh

# Create log file if it doesn't exist
touch /var/log/turnserver.log

# Start coturn TURN server in background
echo "Starting TURN server..."
turnserver -c /etc/coturn/turnserver.conf &

# Wait a moment for TURN server to initialize
sleep 2

# Start the monitoring Node.js service
echo "Starting monitoring service..."
node server.js
