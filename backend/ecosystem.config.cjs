/**
 * PM2 Ecosystem Configuration for MaxiStore Backend
 * 
 * PM2 is a production process manager for Node.js applications
 * Features: Auto-restart, clustering, monitoring, log management
 * 
 * Commands:
 *   Start:   pm2 start ecosystem.config.cjs
 *   Stop:    pm2 stop maxistore-backend
 *   Restart: pm2 restart maxistore-backend
 *   Logs:    pm2 logs maxistore-backend
 *   Monitor: pm2 monit
 *   Status:  pm2 status
 */

module.exports = {
  apps: [
    {
      // Application name
      name: 'maxistore-backend',
      
      // Script to execute
      script: './server.js',
      
      // Node.js interpreter
      interpreter: 'node',
      
      // Arguments passed to the script
      args: '',
      
      // ===== CLUSTERING =====
      // Number of instances (use 'max' for CPU cores, or specific number)
      instances: process.env.NODE_ENV === 'production' ? 'max' : 1,
      
      // Load balancing mode ('cluster' for TCP, 'fork' for single instance)
      exec_mode: process.env.NODE_ENV === 'production' ? 'cluster' : 'fork',
      
      // ===== AUTO-RESTART =====
      // Enable auto-restart
      autorestart: true,
      
      // Max restarts within min_uptime before considering app as errored
      max_restarts: 10,
      
      // Min uptime before considering app as stable (ms)
      min_uptime: '10s',
      
      // Delay between restarts (ms)
      restart_delay: 4000,
      
      // ===== MEMORY MANAGEMENT =====
      // Restart if memory exceeds this limit
      max_memory_restart: '500M',
      
      // ===== ENVIRONMENT VARIABLES =====
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        LOG_LEVEL: 'info',
        LOG_PRETTY: 'false',
      },
      
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001,
        LOG_LEVEL: 'debug',
        LOG_PRETTY: 'true',
      },
      
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3001,
        LOG_LEVEL: 'info',
        LOG_PRETTY: 'false',
      },
      
      // ===== LOGGING =====
      // Log files
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      
      // Log date format
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Merge logs from all instances
      merge_logs: true,
      
      // ===== MONITORING =====
      // Enable process monitoring
      monitoring: true,
      
      // ===== GRACEFUL SHUTDOWN =====
      // Time to wait for graceful shutdown before force kill (ms)
      kill_timeout: 5000,
      
      // Listen for shutdown signal
      listen_timeout: 3000,
      
      // Wait for all connections to close
      shutdown_with_message: true,
      
      // ===== WATCH & RELOAD (disable in production) =====
      // Watch for file changes and auto-reload
      watch: false,
      
      // Ignore these files/folders when watching
      ignore_watch: ['node_modules', 'logs', 'uploads', '.git'],
      
      // ===== SOURCE MAPS =====
      // Enable source maps for better error traces
      source_map_support: true,
      
      // ===== ADDITIONAL OPTIONS =====
      // Time to wait before force killing (ms)
      wait_ready: true,
      
      // Instance name suffix
      instance_var: 'INSTANCE_ID',
      
      // Cron restart (optional - e.g., restart daily at 3 AM)
      // cron_restart: '0 3 * * *',
      
      // Auto dump process list on exit/startup
      automation: false,
    },
  ],
  
  // ===== DEPLOYMENT CONFIGURATION =====
  // (Optional) Configure deployment from Git repository
  deploy: {
    production: {
      // SSH user
      user: 'deploy',
      
      // Server hostname/IP
      host: ['your-server-ip'],
      
      // SSH port
      port: '22',
      
      // Deployment path on server
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/your-repo.git',
      path: '/var/www/maxistore-backend',
      
      // Commands to run before starting
      'pre-deploy-local': '',
      
      // Commands to run on server before setup
      'pre-setup': '',
      
      // Commands to run after code deployment
      'post-deploy': 'npm install --production && npx prisma migrate deploy && pm2 reload ecosystem.config.cjs --env production',
      
      // Environment
      env: {
        NODE_ENV: 'production',
      },
    },
    
    staging: {
      user: 'deploy',
      host: ['your-staging-server-ip'],
      port: '22',
      ref: 'origin/develop',
      repo: 'git@github.com:yourusername/your-repo.git',
      path: '/var/www/maxistore-backend-staging',
      'post-deploy': 'npm install && npx prisma migrate deploy && pm2 reload ecosystem.config.cjs --env staging',
      env: {
        NODE_ENV: 'staging',
      },
    },
  },
};
