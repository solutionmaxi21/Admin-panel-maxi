# 🚀 Complete Remote Server Deployment Guide
**MaxiStore Backend - Step-by-Step Production Deployment**

This guide walks you through deploying your backend to a remote server from scratch. No prior server experience needed.

---

## 📋 Table of Contents
1. [What You Need Before Starting](#what-you-need-before-starting)
2. [Understanding the Architecture](#understanding-the-architecture)
3. [Server Requirements](#server-requirements)
4. [Getting Server Access](#getting-server-access)
5. [Installing Required Software](#installing-required-software)
6. [Setting Up PostgreSQL Database](#setting-up-postgresql-database)
7. [Uploading Your Backend Code](#uploading-your-backend-code)
8. [Configuring Environment Variables](#configuring-environment-variables)
9. [Installing Dependencies & Running Migrations](#installing-dependencies--running-migrations)
10. [Starting the Backend Application](#starting-the-backend-application)
11. [Setting Up Reverse Proxy (Nginx)](#setting-up-reverse-proxy-nginx)
12. [Configuring SSL/HTTPS](#configuring-sslhttps)
13. [Monitoring & Maintenance](#monitoring--maintenance)
14. [Backup Strategy](#backup-strategy)
15. [Troubleshooting Guide](#troubleshooting-guide)
16. [Security Best Practices](#security-best-practices)
17. [Common Issues & Solutions](#common-issues--solutions)

---

## What You Need Before Starting

### 1. Information You Need From Your Friend (Server Owner)

Ask your friend for the following details:

```
✅ Server Access Information:
   - Server IP Address: ___________________ (e.g., 192.168.1.100)
   - SSH Username: ________________________ (e.g., ubuntu, root, admin)
   - SSH Password: ________________________ OR SSH private key file
   - SSH Port: ____________________________ (default is 22)

✅ Server Details:
   - Operating System: ____________________ (Ubuntu, CentOS, Windows Server?)
   - OS Version: __________________________ (e.g., Ubuntu 22.04)
   - Does the server have internet access? [YES/NO]
   - Do you have sudo/admin privileges? [YES/NO]

✅ Optional (Nice to Have):
   - Domain name (if any): ________________ (e.g., api.mystore.com)
   - Is PostgreSQL already installed? [YES/NO]
   - Is Nginx already installed? [YES/NO]
```

### 2. Software You Need on Your Local Computer

#### Windows Users:
- **Git Bash** or **PowerShell** (built-in)
- **SSH Client** (built-in in Windows 10+)
- **Optional**: [PuTTY](https://www.putty.org/) for easier SSH management
- **Optional**: [FileZilla](https://filezilla-project.org/) for file transfers (GUI)
- **Optional**: [WinSCP](https://winscp.net/) for file management

#### Mac/Linux Users:
- Terminal (built-in)
- SSH (built-in)

### 3. Backend Files You'll Upload

You need these from your project:
```
backend/
├── src/              (all source code)
├── routes/           (API routes)
├── prisma/           (database schema)
├── server.js         (entry point)
├── package.json      (dependencies)
├── ecosystem.config.cjs (PM2 config)
├── .env.example      (template)
└── [all other files except node_modules, logs, uploads]
```

---

## Understanding the Architecture

### What You're Deploying

```
┌─────────────────────────────────────────────────────────┐
│                    INTERNET                             │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ HTTPS (Port 443)
                   ▼
         ┌─────────────────────┐
         │   Nginx (Port 80)   │ ◄── Reverse Proxy
         │    + SSL/HTTPS      │
         └─────────┬───────────┘
                   │
                   │ HTTP
                   ▼
         ┌─────────────────────┐
         │   Node.js Backend   │ ◄── Your API (Port 3001)
         │   (PM2 Managed)     │
         └─────────┬───────────┘
                   │
                   │ SQL Queries
                   ▼
         ┌─────────────────────┐
         │   PostgreSQL DB     │ ◄── Database (Port 5432)
         │   (Local/Remote)    │
         └─────────────────────┘
```

### How It Works

1. **Users** make requests to your domain (e.g., `https://api.mystore.com`)
2. **Nginx** receives the request, handles SSL, and forwards to Node.js
3. **Node.js Backend** processes the request, queries database
4. **PostgreSQL** stores and retrieves data
5. **PM2** keeps Node.js running, restarts if it crashes

---

## Server Requirements

### Minimum Specifications
- **CPU**: 2 cores
- **RAM**: 2GB (4GB recommended)
- **Storage**: 20GB free space
- **OS**: Ubuntu 20.04+, Debian 11+, CentOS 8+, or Windows Server 2019+
- **Network**: Internet access for installing packages

### Recommended Specifications
- **CPU**: 4 cores
- **RAM**: 4GB+
- **Storage**: 50GB+ SSD
- **OS**: Ubuntu 22.04 LTS (most compatible)

---

## Getting Server Access

### Step 1: Test SSH Connection

#### On Windows (PowerShell):
```powershell
# Basic connection test
ssh username@server-ip

# Example:
ssh ubuntu@192.168.1.100

# If using custom port:
ssh -p 2222 username@server-ip

# If using SSH key file:
ssh -i C:\path\to\private-key.pem username@server-ip
```

#### On Mac/Linux:
```bash
# Basic connection
ssh username@server-ip

# With custom port
ssh -p 2222 username@server-ip

# With SSH key
ssh -i ~/path/to/private-key.pem username@server-ip
```

### Step 2: First Login

When you first connect:
```bash
# You'll see something like:
The authenticity of host 'xxx.xxx.xxx.xxx' can't be established.
ECDSA key fingerprint is SHA256:xxxxxxxxxxxxx.
Are you sure you want to continue connecting (yes/no)?

# Type: yes [ENTER]

# Then enter password when prompted
```

### Step 3: Verify Access

After logging in:
```bash
# Check where you are
pwd

# Check OS version
cat /etc/os-release

# Check if you have sudo access
sudo -v
# If it asks for password and doesn't error, you have sudo!

# Check available disk space
df -h

# Check RAM
free -h

# Check CPU
nproc
```

---

## Installing Required Software

### For Ubuntu/Debian Linux (Most Common)

#### Step 1: Update System
```bash
# Always update first!
sudo apt update
sudo apt upgrade -y
```

#### Step 2: Install Node.js 20 (LTS)
```bash
# Add Node.js repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version    # Should show v20.x.x
npm --version     # Should show 10.x.x
```

#### Step 3: Install PostgreSQL 15
```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Verify installation
psql --version    # Should show 15.x or 14.x

# Check if PostgreSQL is running
sudo systemctl status postgresql

# If not running, start it:
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Step 4: Install PM2 (Process Manager)
```bash
# Install PM2 globally
sudo npm install -g pm2

# Verify installation
pm2 --version
```

#### Step 5: Install Git (for code deployment)
```bash
# Install Git
sudo apt install -y git

# Verify
git --version
```

#### Step 6: Install Nginx (Reverse Proxy)
```bash
# Install Nginx
sudo apt install -y nginx

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

#### Step 7: Install Certbot (for SSL)
```bash
# Install Certbot for free SSL certificates
sudo apt install -y certbot python3-certbot-nginx
```

---

### For CentOS/RHEL/AlmaLinux

```bash
# Update system
sudo yum update -y

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Install PostgreSQL 15
sudo yum install -y postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Install PM2
sudo npm install -g pm2

# Install Git
sudo yum install -y git

# Install Nginx
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Install Certbot
sudo yum install -y certbot python3-certbot-nginx
```

---

### For Windows Server

1. **Install Node.js**:
   - Download from: https://nodejs.org/
   - Choose LTS version (20.x)
   - Run installer, check "Add to PATH"

2. **Install PostgreSQL**:
   - Download from: https://www.postgresql.org/download/windows/
   - Run installer
   - Remember the password you set!

3. **Install PM2**:
   ```powershell
   npm install -g pm2
   npm install -g pm2-windows-service
   pm2-service-install
   ```

4. **Install Git**:
   - Download from: https://git-scm.com/download/win
   - Run installer

---

## Setting Up PostgreSQL Database

### Step 1: Access PostgreSQL

#### On Linux:
```bash
# Switch to postgres user
sudo -i -u postgres

# Open PostgreSQL prompt
psql
```

#### On Windows:
```powershell
# Open Command Prompt or PowerShell as Administrator
# Navigate to PostgreSQL bin folder
cd "C:\Program Files\PostgreSQL\15\bin"

# Connect as postgres user
psql -U postgres
```

### Step 2: Create Database and User

```sql
-- Create database for your backend
CREATE DATABASE algerian_hardware_db;

-- Create dedicated user (change password!)
CREATE USER maxistore_user WITH ENCRYPTED PASSWORD 'YourStrongPassword123!';

-- Grant all privileges on database to user
GRANT ALL PRIVILEGES ON DATABASE algerian_hardware_db TO maxistore_user;

-- For PostgreSQL 15+, also grant schema privileges
\c algerian_hardware_db
GRANT ALL ON SCHEMA public TO maxistore_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO maxistore_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO maxistore_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO maxistore_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO maxistore_user;

-- Verify database exists
\l

-- Verify user exists
\du

-- Exit PostgreSQL
\q
```

On Linux, exit from postgres user:
```bash
exit
```

### Step 3: Configure PostgreSQL (if needed)

#### Allow Local Connections:
```bash
# Edit PostgreSQL config (Ubuntu example)
sudo nano /etc/postgresql/15/main/postgresql.conf

# Find and ensure this line exists:
listen_addresses = 'localhost'    # For local connections only

# Or if you need remote access:
listen_addresses = '*'             # Allow from any IP
```

#### Configure Authentication:
```bash
# Edit access rules
sudo nano /etc/postgresql/15/main/pg_hba.conf

# Add this line for local password authentication:
host    all             all             127.0.0.1/32            md5

# For remote access (replace 0.0.0.0/0 with your IP range):
host    all             all             0.0.0.0/0               md5
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### Step 4: Test Database Connection

```bash
# Test connection with new user
psql -U maxistore_user -d algerian_hardware_db -h localhost

# If successful, you'll see:
# algerian_hardware_db=>

# Test a simple query
SELECT NOW();

# Exit
\q
```

---

## Uploading Your Backend Code

You have 3 options to upload your code. Choose the one that works best for you.

### Option 1: Using Git (Recommended for Easy Updates)

#### A. Setup Git Repository (One Time)

On your **local machine**:
```bash
# Navigate to your backend folder
cd c:\Users\Pc\Downloads\algerian-hardware-e-commerce\backend

# Initialize git if not already done
git init

# Create .gitignore to exclude sensitive files
echo "node_modules/" >> .gitignore
echo ".env" >> .gitignore
echo "logs/" >> .gitignore
echo "uploads/" >> .gitignore

# Add all files
git add .

# Commit
git commit -m "Initial backend commit"

# Create repository on GitHub/GitLab/Bitbucket
# Then add remote (replace with your repo URL):
git remote add origin https://github.com/yourusername/yourrepo.git

# Push to remote
git push -u origin main
```

#### B. Clone on Server

On **remote server**:
```bash
# Navigate to deployment directory
cd /home/ubuntu    # or /var/www or your preferred location

# Create app directory
mkdir -p maxistore-backend
cd maxistore-backend

# Clone your repository
git clone https://github.com/yourusername/yourrepo.git .

# Or if private repo, you'll need to authenticate:
git clone https://username:token@github.com/yourusername/yourrepo.git .

# Verify files are there
ls -la
```

#### Benefits:
- Easy to update: just run `git pull`
- Version control
- Rollback capability

---

### Option 2: Using SCP (Secure Copy)

On your **local machine**:

#### A. Prepare Files
```bash
# Navigate to parent folder
cd c:\Users\Pc\Downloads\algerian-hardware-e-commerce

# Create archive excluding unnecessary files
# Windows (PowerShell):
Compress-Archive -Path backend\* -DestinationPath backend.zip -Force

# Linux/Mac:
tar --exclude='node_modules' --exclude='logs' --exclude='uploads' --exclude='.env' -czf backend.tar.gz backend/
```

#### B. Copy to Server
```bash
# Windows (PowerShell):
scp backend.zip username@server-ip:/home/username/

# Linux/Mac:
scp backend.tar.gz username@server-ip:/home/username/
```

#### C. Extract on Server
```bash
# On remote server
cd /home/username

# Unzip
unzip backend.zip -d maxistore-backend

# Or for tar.gz:
tar -xzf backend.tar.gz
mv backend maxistore-backend

# Verify
cd maxistore-backend
ls -la
```

---

### Option 3: Using SFTP (FileZilla - GUI Method)

#### A. Install FileZilla
Download from: https://filezilla-project.org/

#### B. Connect to Server
1. Open FileZilla
2. Fill in connection details:
   - **Host**: `sftp://your-server-ip`
   - **Username**: your SSH username
   - **Password**: your SSH password
   - **Port**: 22
3. Click "Quickconnect"

#### C. Upload Files
1. **Left panel** = Your local computer
2. **Right panel** = Remote server
3. Navigate locally to: `c:\Users\Pc\Downloads\algerian-hardware-e-commerce\backend`
4. Navigate remotely to: `/home/username/` or `/var/www/`
5. Drag and drop the entire `backend` folder to remote side
6. Wait for upload to complete (may take 5-10 minutes)

---

## Configuring Environment Variables

### Step 1: Navigate to Backend Directory

```bash
cd /home/username/maxistore-backend    # adjust path as needed
```

### Step 2: Create .env File

```bash
# Copy from template
cp .env.example .env

# Edit with nano text editor
nano .env
```

### Step 3: Configure All Variables

```env
# ==========================================
# APPLICATION
# ==========================================
PORT=3001
NODE_ENV=production

# ==========================================
# DATABASE
# ==========================================
# Format: postgresql://username:password@host:port/database
DATABASE_URL=postgresql://maxistore_user:YourStrongPassword123!@localhost:5432/algerian_hardware_db

# ==========================================
# JWT SECRETS - GENERATE NEW ONES!
# ==========================================
# DO NOT USE THESE EXAMPLES - Generate your own!
JWT_ACCESS_SECRET=REPLACE_WITH_GENERATED_SECRET
JWT_REFRESH_SECRET=REPLACE_WITH_GENERATED_SECRET

# ==========================================
# SECURITY
# ==========================================
# Add your domain or server IP
ALLOWED_ORIGINS=http://your-domain.com,http://server-ip:3000

# Bcrypt salt rounds (10-12 recommended)
BCRYPT_SALT_ROUNDS=12

# HMAC secret for offline sync
HMAC_SECRET=REPLACE_WITH_GENERATED_SECRET

# ==========================================
# TOKEN EXPIRATION
# ==========================================
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
REFRESH_TOKEN_COOKIE_DAYS=7
PASSWORD_RESET_EXPIRY_MINUTES=30
EMAIL_VERIFICATION_EXPIRY_HOURS=24

# ==========================================
# CLIENT URLS
# ==========================================
CLIENT_URL=http://your-domain.com
FRONTEND_URL=http://your-domain.com

# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# ==========================================
# RATE LIMITING
# ==========================================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=5

# ==========================================
# CACHE
# ==========================================
CACHE_ENABLED=true
REVALIDATION_SECRET=REPLACE_WITH_GENERATED_SECRET
STORE_URL=http://your-domain.com

# ==========================================
# ADMIN CREDENTIALS (CHANGE THESE!)
# ==========================================
TEST_ADMIN_EMAIL=admin@yourdomain.com
TEST_ADMIN_PASSWORD=ChangeThisPassword123!

# ==========================================
# EMAIL SERVICE
# ==========================================
# For Gmail, use app password (not regular password)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password

# ==========================================
# GUEPEX SHIPPING API
# ==========================================
GUEPEX_API_ID=your-guepex-api-id
GUEPEX_API_TOKEN=your-guepex-api-token
GUEPEX_BASE_URL=https://api.guepex.app/v1
GUEPEX_WEBHOOK_SECRET=REPLACE_WITH_GENERATED_SECRET
GUEPEX_POLL_INTERVAL_MINUTES=15

# ==========================================
# LOGGING (Optional)
# ==========================================
LOG_LEVEL=info
LOG_PRETTY=false
```

### Step 4: Generate Strong Secrets

```bash
# Generate 5 strong secrets (run this 5 times)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Copy each output and paste into .env for:
# 1. JWT_ACCESS_SECRET
# 2. JWT_REFRESH_SECRET
# 3. HMAC_SECRET
# 4. REVALIDATION_SECRET
# 5. GUEPEX_WEBHOOK_SECRET
```

### Step 5: Save and Secure .env

```bash
# In nano editor:
# Press Ctrl+X to exit
# Press Y to save
# Press Enter to confirm

# Set strict permissions (only owner can read)
chmod 600 .env

# Verify permissions
ls -la .env
# Should show: -rw------- (600)
```

---

## Installing Dependencies & Running Migrations

### Step 1: Install Node Dependencies

```bash
# Make sure you're in backend directory
cd /home/username/maxistore-backend

# Install production dependencies only
npm ci --production

# This will take 2-5 minutes
# You'll see a progress bar installing packages
```

If you get permission errors:
```bash
# Fix npm permissions
sudo chown -R $USER:$USER ~/.npm
sudo chown -R $USER:$USER node_modules/

# Try again
npm ci --production
```

### Step 2: Create Required Directories

```bash
# Create logs and uploads directories
mkdir -p logs uploads

# Set permissions
chmod 755 logs uploads
```

### Step 3: Generate Prisma Client

```bash
# Generate Prisma client for database operations
npx prisma generate
```

### Step 4: Run Database Migrations

```bash
# Deploy database migrations
npm run migrate

# Or manually:
npx prisma migrate deploy
```

You should see output like:
```
✔ Generated Prisma Client
✔ Applying migration 20240101_init
✔ Applying migration 20240102_add_users
✔ All migrations have been successfully applied
```

### Step 5: Verify Database Setup

```bash
# Connect to database
psql -U maxistore_user -d algerian_hardware_db -h localhost

# List tables
\dt

# You should see tables like:
# users, products, orders, categories, etc.

# Check a table
SELECT COUNT(*) FROM users;

# Exit
\q
```

### Step 6: Optional - Seed Initial Data

If you have seed data:
```bash
# Run seed script
npm run db:seed

# Or manually:
node prisma/seed.js
```

---

## Starting the Backend Application

### Option 1: Start with PM2 (Recommended)

#### Step 1: Start Application
```bash
# Make sure you're in backend directory
cd /home/username/maxistore-backend

# Start with PM2 using ecosystem config
npm run start:prod

# Or manually:
pm2 start ecosystem.config.cjs --env production
```

#### Step 2: Save PM2 Process List
```bash
# Save current PM2 processes
pm2 save

# This ensures your app restarts after server reboot
```

#### Step 3: Enable PM2 Startup Script
```bash
# Generate startup script
pm2 startup

# PM2 will output a command like:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Copy and run that command
```

#### Step 4: Verify Application is Running
```bash
# Check PM2 status
pm2 status

# You should see:
┌────┬────────────────────┬─────────────┬─────────┬─────────┬──────────┐
│ id │ name               │ mode        │ ↺       │ status  │ cpu      │
├────┼────────────────────┼─────────────┼─────────┼─────────┼──────────┤
│ 0  │ maxistore-backend  │ cluster     │ 0       │ online  │ 0%       │
└────┴────────────────────┴─────────────┴─────────┴─────────┴──────────┘

# View logs
pm2 logs maxistore-backend

# Test health endpoint
curl http://localhost:3001/api/health

# Should return:
# {"success":true,"status":"ok",...}
```

---

### Option 2: Start with Node (Development/Testing Only)

```bash
# Simple start (not for production)
npm start

# Or:
node server.js

# Press Ctrl+C to stop
```

---

## Setting Up Reverse Proxy (Nginx)

Nginx will:
- Handle SSL/HTTPS
- Serve your API on port 80/443
- Improve performance with caching
- Protect against some attacks

### Step 1: Create Nginx Configuration

```bash
# Create new site configuration
sudo nano /etc/nginx/sites-available/maxistore-backend
```

Paste this configuration:
```nginx
# Upstream backend servers
upstream maxistore_api {
    # Your Node.js backend
    server localhost:3001;
    
    # Keep connections alive for better performance
    keepalive 64;
}

# Redirect HTTP to HTTPS (after SSL is setup)
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com www.your-domain.com;
    
    # Temporary: allow all for testing
    # Later: uncomment this to force HTTPS
    # return 301 https://$server_name$request_uri;
    
    # Temporary: proxy to backend for testing
    location / {
        proxy_pass http://maxistore_api;
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
    
    # Serve uploaded files
    location /uploads {
        proxy_pass http://maxistore_api/uploads;
        proxy_cache_valid 200 1d;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
    
    # Allow large file uploads
    client_max_body_size 50M;
}

# HTTPS server (will be configured after SSL setup)
# server {
#     listen 443 ssl http2;
#     listen [::]:443 ssl http2;
#     server_name your-domain.com www.your-domain.com;
#
#     # SSL certificates (will be added by Certbot)
#     # ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
#     # ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
#
#     # SSL configuration
#     ssl_protocols TLSv1.2 TLSv1.3;
#     ssl_ciphers HIGH:!aNULL:!MD5;
#     ssl_prefer_server_ciphers on;
#
#     # Security headers
#     add_header X-Frame-Options "SAMEORIGIN" always;
#     add_header X-Content-Type-Options "nosniff" always;
#     add_header X-XSS-Protection "1; mode=block" always;
#     add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
#
#     # Proxy to backend
#     location / {
#         proxy_pass http://maxistore_api;
#         proxy_http_version 1.1;
#         proxy_set_header Upgrade $http_upgrade;
#         proxy_set_header Connection 'upgrade';
#         proxy_set_header Host $host;
#         proxy_set_header X-Real-IP $remote_addr;
#         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#         proxy_set_header X-Forwarded-Proto $scheme;
#         proxy_cache_bypass $http_upgrade;
#         proxy_buffering off;
#     }
#
#     # Serve uploaded files
#     location /uploads {
#         proxy_pass http://maxistore_api/uploads;
#         proxy_cache_valid 200 1d;
#         expires 1d;
#         add_header Cache-Control "public, immutable";
#     }
#
#     client_max_body_size 50M;
# }
```

**Important**: Replace `your-domain.com` with your actual domain or server IP.

### Step 2: Enable the Site

```bash
# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/maxistore-backend /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# You should see:
# nginx: configuration file /etc/nginx/nginx.conf test is successful

# If errors, check your configuration file for typos
```

### Step 3: Restart Nginx

```bash
# Restart Nginx
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx

# Should show: active (running)
```

### Step 4: Configure Firewall

```bash
# Allow HTTP traffic (port 80)
sudo ufw allow 80/tcp

# Allow HTTPS traffic (port 443)
sudo ufw allow 443/tcp

# Allow SSH (important!)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Step 5: Test Nginx

From your **local computer**:
```bash
# Replace with your server IP
curl http://your-server-ip/api/health

# Or open in browser:
# http://your-server-ip/api/health

# Should return JSON:
# {"success":true,"status":"ok",...}
```

---

## Configuring SSL/HTTPS

### Prerequisites

You need a domain name pointing to your server. Free options:
- **Freenom**: Free domain names (.tk, .ml, .ga, .cf, .gq)
- **DuckDNS**: Free subdomain (yourdomain.duckdns.org)
- **No-IP**: Free dynamic DNS

Skip this section if you don't have a domain yet (use HTTP only for testing).

### Step 1: Point Domain to Server

In your domain's DNS settings, add an **A Record**:
```
Type: A
Name: @ (or api for subdomain)
Value: your-server-ip
TTL: 3600
```

Wait 5-60 minutes for DNS propagation.

Test with:
```bash
# Test DNS resolution
nslookup your-domain.com

# Or:
ping your-domain.com
```

### Step 2: Install SSL Certificate

```bash
# Make sure Nginx is running
sudo systemctl status nginx

# Obtain SSL certificate from Let's Encrypt
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Follow prompts:
# 1. Enter email address
# 2. Agree to terms of service (Y)
# 3. Share email with EFF (optional)
# 4. Choose: 2 (Redirect HTTP to HTTPS)
```

### Step 3: Verify SSL

Certbot automatically:
- Creates SSL certificates
- Updates Nginx configuration
- Sets up auto-renewal

Test your site:
```bash
# From local computer
curl https://your-domain.com/api/health

# Or open in browser:
# https://your-domain.com/api/health
```

Check SSL grade:
- Visit: https://www.ssllabs.com/ssltest/
- Enter your domain
- Should get A or A+ grade

### Step 4: Setup Auto-Renewal

Certbot automatically sets up renewal. Test it:
```bash
# Test renewal
sudo certbot renew --dry-run

# If successful, renewal is configured!
```

Certificates auto-renew every 60 days.

---

## Monitoring & Maintenance

### Daily Monitoring

#### Check Application Status
```bash
# PM2 status
pm2 status

# View logs (real-time)
pm2 logs maxistore-backend

# View last 50 lines
pm2 logs maxistore-backend --lines 50

# Monitor resources
pm2 monit
```

#### Check Database
```bash
# Connect to database
psql -U maxistore_user -d algerian_hardware_db

# Check row counts
SELECT 'users' as table, COUNT(*) FROM users
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'orders', COUNT(*) FROM orders;

# Check database size
SELECT pg_size_pretty(pg_database_size('algerian_hardware_db'));

# Exit
\q
```

#### Check System Resources
```bash
# Disk space
df -h

# RAM usage
free -h

# CPU usage
top
# Press 'q' to quit

# Check running processes
pm2 status
sudo systemctl status nginx
sudo systemctl status postgresql
```

### PM2 Commands Cheatsheet

```bash
# Start
pm2 start maxistore-backend
pm2 start ecosystem.config.cjs --env production

# Stop
pm2 stop maxistore-backend

# Restart
pm2 restart maxistore-backend

# Reload (zero downtime)
pm2 reload maxistore-backend

# Delete
pm2 delete maxistore-backend

# View logs
pm2 logs maxistore-backend
pm2 logs maxistore-backend --lines 100
pm2 logs maxistore-backend --err  # Only errors

# Monitor
pm2 monit

# Process info
pm2 describe maxistore-backend

# List processes
pm2 list

# Save process list
pm2 save

# Resurrect saved processes
pm2 resurrect

# Flush logs
pm2 flush
```

### Nginx Commands

```bash
# Test configuration
sudo nginx -t

# Restart
sudo systemctl restart nginx

# Reload (no downtime)
sudo systemctl reload nginx

# Stop
sudo systemctl stop nginx

# Start
sudo systemctl start nginx

# Status
sudo systemctl status nginx

# View access logs
sudo tail -f /var/log/nginx/access.log

# View error logs
sudo tail -f /var/log/nginx/error.log
```

### PostgreSQL Commands

```bash
# Status
sudo systemctl status postgresql

# Restart
sudo systemctl restart postgresql

# Stop
sudo systemctl stop postgresql

# Start
sudo systemctl start postgresql

# Connect
psql -U maxistore_user -d algerian_hardware_db

# View logs (Ubuntu)
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

---

## Backup Strategy

### Automated Database Backup

#### Create Backup Script

```bash
# Create backup directory
sudo mkdir -p /backups/database
sudo chown $USER:$USER /backups/database

# Create backup script
nano ~/backup-database.sh
```

Paste this script:
```bash
#!/bin/bash

# Configuration
DB_NAME="algerian_hardware_db"
DB_USER="maxistore_user"
BACKUP_DIR="/backups/database"
RETENTION_DAYS=7

# Create backup with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"

# Create backup
echo "Starting backup..."
pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_FILE

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup successful: $BACKUP_FILE"
    
    # Delete old backups (keep last 7 days)
    find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
    echo "Old backups cleaned up (kept last $RETENTION_DAYS days)"
else
    echo "Backup failed!"
    exit 1
fi
```

Make it executable:
```bash
chmod +x ~/backup-database.sh
```

Test the script:
```bash
./backup-database.sh
```

#### Schedule Daily Backups

```bash
# Edit crontab
crontab -e

# Add this line (backup daily at 2 AM):
0 2 * * * /home/ubuntu/backup-database.sh >> /home/ubuntu/backup.log 2>&1

# Save and exit
```

### Restore from Backup

```bash
# List available backups
ls -lh /backups/database/

# Restore from backup
gunzip -c /backups/database/backup_YYYYMMDD_HHMMSS.sql.gz | psql -U maxistore_user -d algerian_hardware_db
```

### Backup Uploads Folder

```bash
# Create backup directory
sudo mkdir -p /backups/uploads

# Create backup script
nano ~/backup-uploads.sh
```

Paste:
```bash
#!/bin/bash

UPLOADS_DIR="/home/ubuntu/maxistore-backend/uploads"
BACKUP_DIR="/backups/uploads"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup
echo "Backing up uploads..."
tar -czf $BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz -C $(dirname $UPLOADS_DIR) $(basename $UPLOADS_DIR)

# Delete old backups
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "Uploads backup complete"
```

Make executable and schedule:
```bash
chmod +x ~/backup-uploads.sh

# Add to crontab (daily at 3 AM)
crontab -e
# Add:
0 3 * * * /home/ubuntu/backup-uploads.sh >> /home/ubuntu/backup.log 2>&1
```

---

## Troubleshooting Guide

### Backend Not Starting

#### Check PM2 Logs
```bash
pm2 logs maxistore-backend --err
```

Common issues:

1. **Database Connection Failed**
   ```bash
   # Check DATABASE_URL in .env
   cat .env | grep DATABASE_URL
   
   # Test connection manually
   psql -U maxistore_user -d algerian_hardware_db -h localhost
   
   # If fails, check PostgreSQL is running
   sudo systemctl status postgresql
   ```

2. **Port Already in Use**
   ```bash
   # Check what's using port 3001
   sudo lsof -i :3001
   
   # Kill the process
   sudo kill -9 <PID>
   
   # Or change PORT in .env
   ```

3. **Missing Dependencies**
   ```bash
   # Reinstall
   cd /home/ubuntu/maxistore-backend
   rm -rf node_modules
   npm ci --production
   ```

4. **Permission Errors**
   ```bash
   # Fix ownership
   sudo chown -R $USER:$USER /home/ubuntu/maxistore-backend
   
   # Fix .env permissions
   chmod 600 .env
   
   # Fix directory permissions
   chmod 755 logs uploads
   ```

### Can't Access API Remotely

1. **Check if backend is running locally**
   ```bash
   curl http://localhost:3001/api/health
   ```

2. **Check Nginx**
   ```bash
   sudo systemctl status nginx
   sudo nginx -t
   
   # View error logs
   sudo tail -f /var/log/nginx/error.log
   ```

3. **Check Firewall**
   ```bash
   sudo ufw status
   
   # Ensure ports 80 and 443 are allowed
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

4. **Check if port is reachable**
   ```bash
   # From local computer
   telnet your-server-ip 80
   
   # Or
   nc -zv your-server-ip 80
   ```

### Database Issues

1. **Can't Connect to Database**
   ```bash
   # Check if PostgreSQL is running
   sudo systemctl status postgresql
   
   # Start if stopped
   sudo systemctl start postgresql
   
   # Check logs
   sudo tail -f /var/log/postgresql/postgresql-15-main.log
   ```

2. **Permission Denied**
   ```bash
   # Re-grant privileges
   sudo -u postgres psql
   
   \c algerian_hardware_db
   GRANT ALL ON SCHEMA public TO maxistore_user;
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO maxistore_user;
   \q
   ```

3. **Database Full / Out of Space**
   ```bash
   # Check disk space
   df -h
   
   # Check database size
   sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('algerian_hardware_db'));"
   
   # Clean old backups if needed
   sudo rm /backups/database/backup_*.sql.gz
   ```

### High Memory Usage

```bash
# Check memory
free -h

# Check what's using memory
top
# Press 'M' to sort by memory
# Look for node processes

# Restart PM2
pm2 restart maxistore-backend

# Or adjust memory limit in ecosystem.config.cjs
nano ecosystem.config.cjs
# Change: max_memory_restart: '500M'
pm2 reload maxistore-backend
```

### SSL Certificate Issues

```bash
# Test renewal
sudo certbot renew --dry-run

# Force renew
sudo certbot renew --force-renewal

# Check certificate expiry
sudo certbot certificates

# View Nginx SSL config
sudo nano /etc/nginx/sites-available/maxistore-backend
```

---

## Security Best Practices

### 1. Keep Software Updated

```bash
# Update system packages
sudo apt update
sudo apt upgrade -y

# Update Node.js packages
cd /home/ubuntu/maxistore-backend
npm update

# Update PM2
sudo npm update -g pm2
```

### 2. Secure SSH Access

```bash
# Disable root login
sudo nano /etc/ssh/sshd_config

# Set:
PermitRootLogin no
PasswordAuthentication no  # After setting up SSH keys
PubkeyAuthentication yes

# Restart SSH
sudo systemctl restart sshd
```

### 3. Setup Fail2Ban

```bash
# Install Fail2Ban
sudo apt install -y fail2ban

# Create config
sudo nano /etc/fail2ban/jail.local

# Add:
[sshd]
enabled = true
port = 22
maxretry = 3
bantime = 3600

# Start Fail2Ban
sudo systemctl start fail2ban
sudo systemctl enable fail2ban
```

### 4. Regular Security Audits

```bash
# Check for security updates
sudo apt list --upgradable

# Run npm audit
cd /home/ubuntu/maxistore-backend
npm audit

# Fix vulnerabilities
npm audit fix
```

### 5. Monitor Logs

```bash
# Check authentication logs
sudo tail -f /var/log/auth.log

# Check Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Check for suspicious activity
sudo grep "Failed password" /var/log/auth.log
```

---

## Common Issues & Solutions

### Issue: "EADDRINUSE: address already in use"

**Cause**: Port 3001 is already in use

**Solution**:
```bash
# Find process using port
sudo lsof -i :3001

# Kill it
sudo kill -9 <PID>

# Or change PORT in .env
nano .env
# Change PORT=3001 to PORT=3002
pm2 restart maxistore-backend
```

### Issue: "Cannot find module"

**Cause**: Missing dependencies

**Solution**:
```bash
cd /home/ubuntu/maxistore-backend
npm ci --production
pm2 restart maxistore-backend
```

### Issue: "Connection to database failed"

**Cause**: Wrong DATABASE_URL or PostgreSQL not running

**Solution**:
```bash
# Check PostgreSQL
sudo systemctl status postgresql
sudo systemctl start postgresql

# Verify DATABASE_URL
cat .env | grep DATABASE_URL

# Test connection
psql -U maxistore_user -d algerian_hardware_db -h localhost
```

### Issue: "502 Bad Gateway" on Nginx

**Cause**: Backend not running or wrong port

**Solution**:
```bash
# Check backend status
pm2 status

# Start if stopped
pm2 start maxistore-backend

# Check Nginx config
sudo nano /etc/nginx/sites-available/maxistore-backend
# Ensure: proxy_pass http://localhost:3001;

# Restart Nginx
sudo systemctl restart nginx
```

### Issue: Can't upload files / "413 Request Entity Too Large"

**Cause**: Nginx body size limit

**Solution**:
```bash
# Edit Nginx config
sudo nano /etc/nginx/sites-available/maxistore-backend

# Add inside server block:
client_max_body_size 50M;

# Restart Nginx
sudo systemctl restart nginx
```

### Issue: Slow API responses

**Solutions**:
```bash
# 1. Enable caching
nano .env
# Ensure: CACHE_ENABLED=true

# 2. Check database indexes
psql -U maxistore_user -d algerian_hardware_db
\di  # List indexes

# 3. Monitor resources
pm2 monit
top

# 4. Check logs for slow queries
pm2 logs maxistore-backend | grep "Query"

# 5. Restart services
pm2 restart maxistore-backend
sudo systemctl restart postgresql
```

---

## Update Deployment Workflow

When you make changes to your code:

### Using Git (Recommended)

```bash
# On local machine: commit and push changes
git add .
git commit -m "Update description"
git push origin main

# On server: pull and restart
cd /home/ubuntu/maxistore-backend
git pull origin main
npm ci --production
npm run migrate  # If database changes
pm2 reload maxistore-backend
```

### Manual Update

```bash
# 1. Backup current version
cd /home/ubuntu
cp -r maxistore-backend maxistore-backend.backup

# 2. Stop application
pm2 stop maxistore-backend

# 3. Upload new files (SCP/FileZilla)

# 4. Install dependencies
cd maxistore-backend
npm ci --production

# 5. Run migrations if needed
npm run migrate

# 6. Start application
pm2 start maxistore-backend

# 7. Verify
curl http://localhost:3001/api/health
```

---

## Quick Reference Card

Print this and keep it handy!

```
═══════════════════════════════════════════════════
        MAXISTORE BACKEND - QUICK REFERENCE
═══════════════════════════════════════════════════

SSH CONNECTION:
  ssh username@server-ip

PM2 COMMANDS:
  pm2 status                    - Check status
  pm2 logs maxistore-backend    - View logs
  pm2 restart maxistore-backend - Restart app
  pm2 monit                     - Monitor resources

HEALTH CHECK:
  curl http://localhost:3001/api/health

DATABASE:
  psql -U maxistore_user -d algerian_hardware_db

NGINX:
  sudo systemctl restart nginx
  sudo nginx -t

LOGS:
  PM2:        pm2 logs maxistore-backend
  Nginx:      sudo tail -f /var/log/nginx/error.log
  PostgreSQL: sudo tail -f /var/log/postgresql/*.log

DISK SPACE:
  df -h

MEMORY:
  free -h

UPDATE APP:
  cd maxistore-backend
  git pull
  npm ci --production
  npm run migrate
  pm2 reload maxistore-backend

BACKUP DATABASE:
  ./backup-database.sh

EMERGENCY RESTART:
  pm2 restart maxistore-backend
  sudo systemctl restart postgresql
  sudo systemctl restart nginx

═══════════════════════════════════════════════════
```

---

## 🎉 Congratulations!

You've successfully deployed your MaxiStore backend to a production server!

### What You've Accomplished:

✅ Installed all required software (Node.js, PostgreSQL, PM2, Nginx)
✅ Configured PostgreSQL database
✅ Uploaded and configured your backend code
✅ Started your application with PM2 (auto-restart enabled)
✅ Configured Nginx as reverse proxy
✅ Set up SSL/HTTPS (optional)
✅ Implemented monitoring and backups
✅ Secured your server

### Your API is Now Available At:

- **Local**: http://localhost:3001/api
- **Remote**: http://your-server-ip/api
- **Domain** (if configured): https://your-domain.com/api

### Important URLs:

- Health Check: `/api/health`
- API Documentation: `/api`
- Admin Panel: Your admin app connects here

---

## 📞 Getting Help

If you encounter issues not covered in this guide:

1. **Check Logs**:
   ```bash
   pm2 logs maxistore-backend --lines 100
   ```

2. **Check System Status**:
   ```bash
   pm2 status
   sudo systemctl status nginx
   sudo systemctl status postgresql
   ```

3. **Review Documentation**:
   - [DEPLOYMENT.md](backend/DEPLOYMENT.md)
   - [PRODUCTION-CHECKLIST.md](backend/PRODUCTION-CHECKLIST.md)
   - [README.md](backend/README.md)

4. **Common Issues**: See [Troubleshooting Guide](#troubleshooting-guide) above

---

**Your backend is now live and serving requests! 🚀**
