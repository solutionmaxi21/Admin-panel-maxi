@echo off
REM ===================================================================
REM MaxiStore Backend - Windows Server Production Setup Script
REM ===================================================================
REM This script automates the production setup on Windows Server
REM 
REM Prerequisites:
REM - Node.js 18+ or 20+ installed
REM - PostgreSQL 13+ installed and running
REM - Git installed
REM ===================================================================

echo.
echo ========================================
echo  MaxiStore Backend - Production Setup
echo ========================================
echo.

REM Check Node.js
echo [1/8] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)
node --version
echo.

REM Check PostgreSQL
echo [2/8] Checking PostgreSQL installation...
psql --version >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: PostgreSQL not found in PATH
    echo Make sure PostgreSQL is installed and running
)
echo.

REM Install PM2 globally
echo [3/8] Installing PM2 globally...
call npm install -g pm2
if %errorlevel% neq 0 (
    echo ERROR: Failed to install PM2
    pause
    exit /b 1
)
echo.

REM Install production dependencies
echo [4/8] Installing production dependencies...
call npm ci --production
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
echo.

REM Check for .env file
echo [5/8] Checking environment configuration...
if not exist ".env" (
    echo WARNING: .env file not found!
    echo Creating from template...
    copy .env.example .env
    echo.
    echo IMPORTANT: Edit .env file with your production values!
    echo Press any key to open .env in notepad...
    pause >nul
    notepad .env
)
echo.

REM Create required directories
echo [6/8] Creating required directories...
if not exist "logs" mkdir logs
if not exist "uploads" mkdir uploads
echo Directories created successfully.
echo.

REM Run database migrations
echo [7/8] Running database migrations...
echo.
echo Make sure your DATABASE_URL is correctly set in .env
echo Press any key to continue or Ctrl+C to cancel...
pause >nul

call npm run migrate
if %errorlevel% neq 0 (
    echo ERROR: Database migration failed!
    echo Check your DATABASE_URL and ensure PostgreSQL is running
    pause
    exit /b 1
)
echo.

REM Start with PM2
echo [8/8] Starting application with PM2...
call pm2 start ecosystem.config.cjs --env production
if %errorlevel% neq 0 (
    echo ERROR: Failed to start with PM2
    pause
    exit /b 1
)
echo.

REM Save PM2 configuration
echo Saving PM2 configuration...
call pm2 save
echo.

REM Setup PM2 startup
echo Setting up PM2 auto-startup...
call pm2 startup
echo.
echo NOTE: Run the command shown above to enable PM2 startup
echo.

REM Show status
echo ========================================
echo  Setup Complete!
echo ========================================
echo.
call pm2 status
echo.
echo Application Status:
call pm2 describe maxistore-backend
echo.
echo ========================================
echo  Next Steps:
echo ========================================
echo.
echo 1. Verify .env contains production values
echo 2. Test the API: http://localhost:3001/api/health
echo 3. Configure reverse proxy (IIS/Nginx)
echo 4. Setup SSL certificate
echo 5. Configure Windows Firewall
echo 6. Setup database backups
echo.
echo ========================================
echo  Useful Commands:
echo ========================================
echo.
echo   Start:   pm2 start maxistore-backend
echo   Stop:    pm2 stop maxistore-backend
echo   Restart: pm2 restart maxistore-backend
echo   Logs:    pm2 logs maxistore-backend
echo   Status:  pm2 status
echo   Monitor: pm2 monit
echo.
echo Documentation: See DEPLOYMENT.md
echo Checklist: See PRODUCTION-CHECKLIST.md
echo.
pause
