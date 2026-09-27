@echo off
echo Starting PostgreSQL service...
echo This requires Administrator privileges.
echo.

net start postgresql-x64-18

if %ERRORLEVEL% EQU 0 (
    echo.
    echo PostgreSQL service started successfully!
    echo.
    echo You can now run: node scripts/test-connection.js
    echo.
) else (
    echo.
    echo Failed to start PostgreSQL service.
    echo Please run this file as Administrator:
    echo Right-click start-postgres.bat ^> Run as Administrator
    echo.
)

pause
