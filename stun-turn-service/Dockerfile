FROM node:18-alpine

# Install coturn STUN/TURN server
RUN apk add --no-cache coturn

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy app files
COPY . .

# Expose STUN/TURN ports
# STUN: 3478 (UDP/TCP)
# TURN: 3478 (UDP/TCP), 5349 (TLS)
# TURN relay ports: 49152-65535 (UDP)
EXPOSE 3478/tcp 3478/udp 5349/tcp 5349/udp
EXPOSE 49152-65535/udp

# Copy coturn config
COPY turnserver.conf /etc/coturn/turnserver.conf

# Create script to run both coturn and the monitoring service
COPY start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
