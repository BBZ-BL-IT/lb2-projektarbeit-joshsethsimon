#!/bin/sh

# Get environment variables with defaults
TURN_USERNAME=${TURN_USERNAME:-turnuser}
TURN_PASSWORD=${TURN_PASSWORD:-turnpassword}
TURN_SERVER_HOST=${TURN_SERVER_HOST:-localhost}
EXTERNAL_IP=${EXTERNAL_IP:-}

echo "=== TURN Server Configuration ==="
echo "Realm: $TURN_SERVER_HOST"
echo "Username: $TURN_USERNAME"
echo "External IP: ${EXTERNAL_IP:-Auto-detect}"
echo "=================================="

# Create log file if it doesn't exist
touch /var/log/turnserver.log

# Copy the base config
cp /etc/coturn/turnserver.conf /tmp/turnserver.conf

# Add user credentials to config
echo "user=${TURN_USERNAME}:${TURN_PASSWORD}" >> /tmp/turnserver.conf

# Set realm
echo "realm=${TURN_SERVER_HOST}" >> /tmp/turnserver.conf
echo "server-name=${TURN_SERVER_HOST}" >> /tmp/turnserver.conf

# Set external IP if provided
if [ ! -z "$EXTERNAL_IP" ]; then
  echo "external-ip=$EXTERNAL_IP" >> /tmp/turnserver.conf
  echo "Using external IP: $EXTERNAL_IP"
else
  echo "No external IP set, using relay-ip=0.0.0.0"
fi

# Start coturn TURN server in background with the generated config
echo "Starting TURN server..."
turnserver -c /tmp/turnserver.conf &

# Wait a moment for TURN server to initialize
sleep 3

# Check if turnserver is running
if ! pgrep -x "turnserver" > /dev/null; then
  echo "ERROR: TURN server failed to start!"
  cat /var/log/turnserver.log
  exit 1
fi

echo "TURN server started successfully"

# Start the monitoring Node.js service
echo "Starting monitoring service..."
exec node server.js
