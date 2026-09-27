#!/bin/bash
###################################################################
# MaxiStore Backend - Linux Server Production Setup Script
###################################################################
# This script automates the production setup on Linux servers
# 
# Prerequisites:
# - Ubuntu 20.04+ / Debian 11+ / CentOS 8+
# - Root or sudo access
###################################################################

set -e

echo ""
echo "========================================"
echo " MaxiStore Backend - Production Setup"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${YELLOW}WARNING: Running as root is not recommended${NC}"
   echo "Consider running as a dedicated 'deploy' user"
   echo ""
fi

# Check Node.js
echo "[1/10] Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js is not installed!${NC}"
    echo "Install with:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    exit 1
fi
echo "Node.js version: $(node --version)"
echo ""

# Check PostgreSQL
echo "[2/10] Checking PostgreSQL installation..."
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}WARNING: PostgreSQL not found${NC}"
    echo "Install with: sudo apt-get install -y postgresql postgresql-contrib"
fi
echo ""

# Install PM2 globally
echo "[3/10] Installing PM2 globally..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
else
    echo "PM2 already installed: $(pm2 --version)"
fi
echo ""

# Install production dependencies
echo "[4/10] Installing production dependencies..."
npm ci --production
echo ""

# Check for .env file
echo "[5/10] Checking environment configuration..."
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}WARNING: .env file not found!${NC}"
    echo "Creating from template..."
    cp .env.example .env
    echo ""
    echo -e "${YELLOW}IMPORTANT: Edit .env file with your production values!${NC}"
    echo "Edit now? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        ${EDITOR:-nano} .env
    fi
fi
echo ""

# Set proper permissions
echo "[6/10] Setting file permissions..."
chmod 600 .env
echo ".env permissions set to 600"
echo ""

# Create required directories
echo "[7/10] Creating required directories..."
mkdir -p logs uploads
chmod 755 logs uploads
echo "Directories created successfully."
echo ""

# Generate secrets if needed
echo "[8/10] Checking secrets..."
if grep -q "GENERATE_YOUR_OWN" .env; then
    echo -e "${YELLOW}WARNING: Default secrets detected in .env${NC}"
    echo "Generate new secrets? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo ""
        echo "Generated secrets (copy these to your .env):"
        echo ""
        for i in {1..5}; do
            echo "Secret $i: $(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")"
        done
        echo ""
        echo "Press Enter to continue after updating .env..."
        read -r
    fi
fi
echo ""

# Run database migrations
echo "[9/10] Running database migrations..."
echo ""
echo "Make sure your DATABASE_URL is correctly set in .env"
echo "Continue? (y/n)"
read -r response
if [[ ! "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Skipping migrations. Run manually with: npm run migrate"
else
    npm run migrate
fi
echo ""

# Start with PM2
echo "[10/10] Starting application with PM2..."
pm2 start ecosystem.config.cjs --env production
echo ""

# Save PM2 configuration
echo "Saving PM2 configuration..."
pm2 save
echo ""

# Setup PM2 startup
echo "Setting up PM2 auto-startup..."
pm2 startup
echo ""
echo -e "${YELLOW}NOTE: Run the command shown above to enable PM2 startup${NC}"
echo ""

# Show status
echo "========================================"
echo " Setup Complete!"
echo "========================================"
echo ""
pm2 status
echo ""

echo "========================================"
echo " Next Steps:"
echo "========================================"
echo ""
echo "1. Verify .env contains production values"
echo "2. Test the API: curl http://localhost:3001/api/health"
echo "3. Configure Nginx as reverse proxy"
echo "4. Setup SSL certificate (certbot)"
echo "5. Configure firewall (ufw)"
echo "6. Setup database backups (cron)"
echo ""
echo "========================================"
echo " Useful Commands:"
echo "========================================"
echo ""
echo "  Start:   pm2 start maxistore-backend"
echo "  Stop:    pm2 stop maxistore-backend"
echo "  Restart: pm2 restart maxistore-backend"
echo "  Logs:    pm2 logs maxistore-backend"
echo "  Status:  pm2 status"
echo "  Monitor: pm2 monit"
echo ""
echo "Documentation: See DEPLOYMENT.md"
echo "Checklist: See PRODUCTION-CHECKLIST.md"
echo ""
