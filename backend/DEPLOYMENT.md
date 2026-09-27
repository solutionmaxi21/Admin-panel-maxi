# 🚀 MaxiStore Backend - Production Deployment Guide

Complete guide for deploying the MaxiStore backend API to a production server.

## 📋 Table of Contents
- [Prerequisites](#prerequisites)
- [Server Setup](#server-setup)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [Starting the Application](#starting-the-application)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)
- [Security Checklist](#security-checklist)

---

## Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+ / Windows Server 2019+
- **Node.js**: v18.x or v20.x (LTS recommended)
- **PostgreSQL**: v13+ (v15 recommended)
- **RAM**: Minimum 2GB (4GB+ recommended)
- **CPU**: 2+ cores recommended
- **Storage**: 20GB+ free space

### Required Software
```bash
# Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# PM2 (Process Manager)
sudo npm install -g pm2

# Git
sudo apt-get install -y git
```

---

## Server Setup

### 1. Create Deployment User
```bash
# Create a dedicated user for the application
sudo adduser deploy
sudo usermod -aG sudo deploy

# Switch to deploy user
su - deploy
```

### 2. Setup Firewall
```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. Install Nginx (Reverse Proxy)
```bash
sudo apt-get install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Installation

### 1. Clone Repository
```bash
cd /var/www
sudo mkdir -p maxistore-backend
sudo chown deploy:deploy maxistore-backend
cd maxistore-backend

# Clone your repository
git clone <your-repo-url> .

# Navigate to backend directory
cd backend
```

### 2. Install Dependencies
```bash
# Install production dependencies only
npm ci --production

# Install PM2 if not already global
npm install pm2 --save-dev
```

---

## Configuration

### 1. Environment Variables

Create and configure your `.env` file:

```bash
# Copy template
cp .env.example .env

# Edit with your production values
nano .env
```

**Critical values to change:**

```bash
NODE_ENV=production

# Database (adjust for your PostgreSQL setup)
DATABASE_URL=postgresql://your_db_user:your_db_password@localhost:5432/maxistore_prod

# Generate strong secrets (run these commands):
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# JWT Secrets (use generated values above)
JWT_ACCESS_SECRET=<your-generated-secret>
JWT_REFRESH_SECRET=<your-generated-secret>

# Security
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
HMAC_SECRET=<your-generated-secret>
REVALIDATION_SECRET=<your-generated-secret>

# URLs
CLIENT_URL=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
STORE_URL=https://yourdomain.com

# Email (Gmail example - use app password)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Guepex Shipping API
GUEPEX_API_ID=your-api-id
GUEPEX_API_TOKEN=your-api-token
GUEPEX_WEBHOOK_SECRET=<your-generated-secret>

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# Remove test credentials in production!
# TEST_ADMIN_EMAIL=
# TEST_ADMIN_PASSWORD=
```

### 2. Secure Environment File
```bash
# Protect .env file
chmod 600 .env

# Ensure it's not tracked by Git
echo ".env" >> .gitignore
```

### 3. Create Required Directories
```bash
# Create directories if they don't exist
mkdir -p logs uploads

# Set proper permissions
chmod 755 logs uploads
```

---

## Database Setup

### 1. Create PostgreSQL Database

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE maxistore_prod;
CREATE USER maxistore_user WITH ENCRYPTED PASSWORD 'your-strong-password';
GRANT ALL PRIVILEGES ON DATABASE maxistore_prod TO maxistore_user;

# PostgreSQL 15+ requires additional grants
\c maxistore_prod
GRANT ALL ON SCHEMA public TO maxistore_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO maxistore_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO maxistore_user;

\q
```

### 2. Run Database Migrations

```bash
# Deploy migrations to production
npm run migrate

# Optional: Seed initial data
npm run db:seed
```

### 3. Verify Database Connection

```bash
# Test connection
node -e "require('dotenv').config(); const pg = require('pg'); const pool = new pg.Pool({connectionString: process.env.DATABASE_URL}); pool.query('SELECT NOW()').then(r => console.log('✓ Connected:', r.rows[0])).catch(e => console.error('✗ Error:', e.message));"
```

---

## Starting the Application

### 1. PM2 Configuration

The `ecosystem.config.cjs` file is already configured. Review and adjust if needed:

```bash
nano ecosystem.config.cjs
```

### 2. Start with PM2

```bash
# Start in production mode
npm run start:prod

# Or directly with PM2
pm2 start ecosystem.config.cjs --env production

# Save PM2 process list
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Follow the instructions displayed
```

### 3. Verify Application is Running

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs maxistore-backend

# Monitor in real-time
pm2 monit

# Test API endpoint
curl http://localhost:3001/api/health
```

---

## Nginx Configuration (Reverse Proxy)

### 1. Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/maxistore-api
```

Add this configuration:

```nginx
# Upstream backend
upstream maxistore_backend {
    server localhost:3001;
    keepalive 64;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name api.yourdomain.com;
    
    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Proxy settings
    location / {
        proxy_pass http://maxistore_backend;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
    }

    # Static files (uploads)
    location /uploads {
        proxy_pass http://maxistore_backend/uploads;
        proxy_cache_valid 200 1d;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }

    # Client max body size for uploads
    client_max_body_size 50M;
}
```

### 2. Enable Site and Restart Nginx

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/maxistore-api /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 3. Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal is setup automatically
# Test renewal:
sudo certbot renew --dry-run
```

---

## Monitoring & Maintenance

### PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs maxistore-backend
pm2 logs maxistore-backend --lines 100

# Monitor resources
pm2 monit

# Restart application
pm2 restart maxistore-backend

# Reload without downtime (cluster mode)
pm2 reload maxistore-backend

# Stop application
pm2 stop maxistore-backend

# Delete from PM2
pm2 delete maxistore-backend
```

### Log Management

```bash
# View application logs
tail -f logs/pm2-combined.log
tail -f logs/pm2-error.log

# Setup log rotation (PM2 module)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Database Backup

```bash
# Create backup script
nano ~/backup-database.sh
```

Add:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/maxistore"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U maxistore_user maxistore_prod | gzip > $BACKUP_DIR/backup_$TIMESTAMP.sql.gz

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: backup_$TIMESTAMP.sql.gz"
```

```bash
# Make executable
chmod +x ~/backup-database.sh

# Setup daily cron job
crontab -e

# Add line (daily at 2 AM):
0 2 * * * /home/deploy/backup-database.sh >> /home/deploy/backup.log 2>&1
```

### Updates and Deployment

```bash
# Pull latest code
cd /var/www/maxistore-backend/backend
git pull origin main

# Install new dependencies
npm ci --production

# Run migrations
npm run migrate

# Reload application (zero downtime)
pm2 reload maxistore-backend
```

---

## Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs maxistore-backend --err

# Check environment variables
pm2 env 0

# Verify database connection
node -e "require('dotenv').config(); console.log('DB:', process.env.DATABASE_URL)"
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection from app user
psql -U maxistore_user -d maxistore_prod -h localhost

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

### High Memory Usage

```bash
# Check PM2 memory usage
pm2 monit

# Restart if needed
pm2 restart maxistore-backend

# Adjust max_memory_restart in ecosystem.config.cjs
```

### Port Already in Use

```bash
# Find process using port 3001
sudo lsof -i :3001

# Kill process if needed
kill -9 <PID>
```

---

## Security Checklist

✅ **Before Going Live:**

- [ ] Strong, unique secrets generated for all environment variables
- [ ] `.env` file permissions set to 600
- [ ] `.env` added to `.gitignore`
- [ ] `NODE_ENV` set to `production`
- [ ] Test admin credentials removed or changed
- [ ] Database user has minimal required permissions
- [ ] Firewall configured (only necessary ports open)
- [ ] SSL/TLS certificates installed
- [ ] Nginx reverse proxy configured
- [ ] PM2 startup script enabled
- [ ] Log rotation configured
- [ ] Database backups scheduled
- [ ] Monitoring/alerting setup
- [ ] ALLOWED_ORIGINS updated with production domains
- [ ] Email service configured and tested
- [ ] API rate limiting verified
- [ ] All dependencies up to date (`npm audit`)
- [ ] Regular security updates scheduled

---

## Performance Optimization

### 1. PostgreSQL Tuning

```bash
sudo nano /etc/postgresql/15/main/postgresql.conf
```

Adjust based on your server:
```
# For 4GB RAM server
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
work_mem = 16MB
max_connections = 100
```

### 2. PM2 Clustering

Already configured in `ecosystem.config.cjs`. In production, PM2 will use all CPU cores.

### 3. Nginx Caching

Already configured for static files (uploads). Consider adding API response caching for frequently accessed endpoints.

---

## Support

For issues and questions:
- Check logs: `pm2 logs maxistore-backend`
- API health check: `https://api.yourdomain.com/api/health`
- Database admin: `npm run db:studio`

---

## Quick Reference Commands

```bash
# Start
npm run start:prod

# Stop
pm2 stop maxistore-backend

# Restart
pm2 restart maxistore-backend

# Logs
pm2 logs maxistore-backend

# Status
pm2 status

# Monitor
pm2 monit

# Update & Deploy
git pull && npm ci --production && npm run migrate && pm2 reload maxistore-backend
```

---

**🎉 Your MaxiStore backend is now production-ready!**
