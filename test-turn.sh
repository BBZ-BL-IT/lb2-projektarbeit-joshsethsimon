#!/bin/bash

# TURN Server Test Script
# This script checks if the TURN server is properly configured and running

echo "========================================="
echo "TURN Server Configuration Test"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if container is running
echo "1. Checking if stun-turn-service container is running..."
if docker ps | grep -q stun-turn-service; then
    echo -e "${GREEN}✓${NC} Container is running"
else
    echo -e "${RED}✗${NC} Container is NOT running"
    echo "   Run: docker-compose up -d stun-turn-service"
    exit 1
fi
echo ""

# Check if turnserver process is running
echo "2. Checking if turnserver process is active..."
if docker exec stun-turn-service pgrep -x turnserver > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} turnserver process is running"
else
    echo -e "${RED}✗${NC} turnserver process is NOT running"
    echo "   Check logs: docker logs stun-turn-service"
    exit 1
fi
echo ""

# Check if ports are listening
echo "3. Checking if TURN ports are listening..."
if docker exec stun-turn-service netstat -tuln 2>/dev/null | grep -q ":3478"; then
    echo -e "${GREEN}✓${NC} Port 3478 is listening"
else
    echo -e "${YELLOW}⚠${NC} Port 3478 status unknown (netstat may not be available)"
fi
echo ""

# Test API endpoint
echo "4. Testing TURN config API endpoint..."
if curl -s -f http://localhost:8005/api/turn/config > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} API endpoint is responding"
    
    # Show configuration
    echo ""
    echo "TURN Configuration:"
    curl -s http://localhost:8005/api/turn/config | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8005/api/turn/config
    echo ""
else
    echo -e "${RED}✗${NC} API endpoint is NOT responding"
    echo "   Check if port 8005 is accessible"
    exit 1
fi
echo ""

# Test health endpoint
echo "5. Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:8005/health)
if echo "$HEALTH_RESPONSE" | grep -q '"status":"OK"'; then
    echo -e "${GREEN}✓${NC} Health check passed"
else
    echo -e "${RED}✗${NC} Health check failed or degraded"
    echo "$HEALTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESPONSE"
fi
echo ""

# Check TURN server logs for errors
echo "6. Checking recent logs for errors..."
ERROR_COUNT=$(docker logs --tail 50 stun-turn-service 2>&1 | grep -i error | wc -l)
if [ "$ERROR_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} No recent errors in logs"
else
    echo -e "${YELLOW}⚠${NC} Found $ERROR_COUNT error(s) in recent logs"
    echo "   View full logs: docker logs stun-turn-service"
fi
echo ""

# Show statistics
echo "7. Fetching TURN statistics..."
curl -s http://localhost:8005/api/turn/stats | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8005/api/turn/stats
echo ""

echo "========================================="
echo "Test Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Test from browser: Open http://localhost:8005/api/turn/diagnostic"
echo "  2. View stats: Open http://localhost:8005/api/turn/stats"
echo "  3. Check logs: docker logs -f stun-turn-service"
echo ""
echo "For WebRTC testing and troubleshooting, see WEBRTC_SETUP.md"
echo ""
