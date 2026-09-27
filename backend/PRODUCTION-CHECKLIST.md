# 🔒 Production Security & Deployment Checklist

Use this checklist before deploying to production to ensure your backend is secure and production-ready.

## ✅ Pre-Deployment Checklist

### 🔐 Security Configuration

- [ ] **Generate Strong Secrets**
  ```bash
  # Run this command 5 times to generate unique secrets:
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
  - [ ] `JWT_ACCESS_SECRET` - Use generated value
  - [ ] `JWT_REFRESH_SECRET` - Use generated value
  - [ ] `HMAC_SECRET` - Use generated value
  - [ ] `REVALIDATION_SECRET` - Use generated value
  - [ ] `GUEPEX_WEBHOOK_SECRET` - Use generated value

- [ ] **Environment Variables**
  - [ ] `.env` file created from `.env.example`
  - [ ] `NODE_ENV=production` set
  - [ ] All placeholder values replaced with real credentials
  - [ ] `.env` file permissions set to 600 (`chmod 600 .env`)
  - [ ] `.env` is in `.gitignore` (never commit!)

- [ ] **Database Security**
  - [ ] `DATABASE_URL` configured with production database
  - [ ] Database user has minimal required permissions
  - [ ] Strong database password set
  - [ ] PostgreSQL configured to accept only local/trusted connections
  - [ ] Database backups scheduled

- [ ] **API Security**
  - [ ] `ALLOWED_ORIGINS` updated with production domains only
  - [ ] Rate limiting configured and tested
  - [ ] CORS properly configured for production domain
  - [ ] Helmet security headers enabled
  - [ ] API endpoints require authentication where needed

- [ ] **Credentials & Access**
  - [ ] Test admin credentials changed or removed
  - [ ] Email service configured with production credentials
  - [ ] Gmail app password generated (if using Gmail)
  - [ ] Google OAuth client ID configured
  - [ ] Guepex API credentials configured

### 🚀 Infrastructure Setup

- [ ] **Server Requirements**
  - [ ] Node.js v18+ or v20+ installed
  - [ ] PostgreSQL v13+ installed
  - [ ] PM2 installed globally
  - [ ] Nginx installed (for reverse proxy)
  - [ ] SSL certificates obtained (Let's Encrypt)

- [ ] **Application Setup**
  - [ ] Dependencies installed (`npm ci --production`)
  - [ ] Required directories created (logs, uploads)
  - [ ] Proper file permissions set
  - [ ] PM2 ecosystem.config.cjs reviewed

- [ ] **Database Setup**
  - [ ] Production database created
  - [ ] Migrations run (`npm run migrate`)
  - [ ] Seed data loaded if needed
  - [ ] Database connection tested

### 🌐 Network & Domain

- [ ] **DNS Configuration**
  - [ ] Domain/subdomain points to server IP
  - [ ] A/AAAA records configured
  - [ ] DNS propagation complete

- [ ] **SSL/TLS**
  - [ ] SSL certificates installed
  - [ ] HTTPS working
  - [ ] HTTP redirects to HTTPS
  - [ ] SSL grade A or A+ (test at ssllabs.com)

- [ ] **Reverse Proxy**
  - [ ] Nginx configured as reverse proxy
  - [ ] Proxy headers set correctly
  - [ ] Rate limiting at proxy level (optional)
  - [ ] Static file serving optimized

### 📊 Monitoring & Logging

- [ ] **Application Monitoring**
  - [ ] PM2 configured and running
  - [ ] PM2 startup script enabled (`pm2 startup`)
  - [ ] PM2 process list saved (`pm2 save`)
  - [ ] Application auto-restarts on crash

- [ ] **Logging**
  - [ ] Log files created and writable
  - [ ] Log rotation configured
  - [ ] Error tracking setup (optional: Sentry, etc.)
  - [ ] Log level set appropriately (info for production)

- [ ] **Backups**
  - [ ] Database backup script created
  - [ ] Automated daily backups scheduled (cron)
  - [ ] Backup retention policy set
  - [ ] Backup restore procedure tested

### 🔍 Testing

- [ ] **Functionality Testing**
  - [ ] `/api/health` endpoint returns 200 OK
  - [ ] Authentication works (login, register, refresh)
  - [ ] API endpoints return expected responses
  - [ ] File uploads work correctly
  - [ ] Email sending works

- [ ] **Performance Testing**
  - [ ] Load testing completed (k6 tests)
  - [ ] Database queries optimized
  - [ ] Response times acceptable
  - [ ] Connection pooling working

- [ ] **Security Testing**
  - [ ] OWASP ZAP scan completed (no high-severity issues)
  - [ ] SQL injection protection verified
  - [ ] XSS protection verified
  - [ ] CSRF protection verified
  - [ ] Authentication bypass attempts fail

### 🛡️ Firewall & Access Control

- [ ] **Firewall Configuration**
  - [ ] SSH port allowed (22)
  - [ ] HTTP port allowed (80)
  - [ ] HTTPS port allowed (443)
  - [ ] PostgreSQL port blocked from external access
  - [ ] Unnecessary ports closed

- [ ] **SSH Security**
  - [ ] SSH key-based authentication enabled
  - [ ] Password authentication disabled (optional but recommended)
  - [ ] Root login disabled
  - [ ] Fail2ban installed and configured

### 📱 External Services

- [ ] **Email Service**
  - [ ] Email provider configured
  - [ ] Test email sent successfully
  - [ ] SPF/DKIM records set (if using custom domain)

- [ ] **Shipping API (Guepex)**
  - [ ] API credentials configured
  - [ ] Test order creation successful
  - [ ] Webhook endpoint accessible
  - [ ] Polling service working

- [ ] **OAuth Providers**
  - [ ] Google OAuth configured
  - [ ] Authorized redirect URIs updated

### 📝 Documentation & Procedures

- [ ] **Documentation Complete**
  - [ ] DEPLOYMENT.md reviewed
  - [ ] Team has access to credentials (secure vault)
  - [ ] Deployment procedure documented
  - [ ] Rollback procedure documented

- [ ] **Emergency Contacts**
  - [ ] On-call schedule defined
  - [ ] Emergency contacts list maintained
  - [ ] Incident response plan created

## 🚨 Launch Day Checklist

**Final checks before switching DNS/going live:**

1. [ ] All above items completed
2. [ ] Full backup taken
3. [ ] Rollback plan prepared
4. [ ] Team notified
5. [ ] Monitoring dashboard open
6. [ ] Test production URL (before DNS switch)
7. [ ] Switch DNS
8. [ ] Verify site loads correctly
9. [ ] Monitor logs for 30 minutes
10. [ ] Run smoke tests
11. [ ] Celebrate! 🎉

## 🔄 Post-Deployment

**Within 24 hours:**

- [ ] Monitor error logs
- [ ] Check application performance
- [ ] Verify all features working
- [ ] Review user feedback
- [ ] Check database performance
- [ ] Verify backups completed

**Within 1 week:**

- [ ] Schedule regular maintenance windows
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom, etc.)
- [ ] Configure alerting for critical issues
- [ ] Review and optimize slow queries
- [ ] Plan for scaling if needed

## 🆘 Emergency Procedures

### If Application Crashes

```bash
# Check status
pm2 status

# View logs
pm2 logs maxistore-backend --lines 100

# Restart
pm2 restart maxistore-backend
```

### If Database Issues

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Restart PostgreSQL
sudo systemctl restart postgresql

# Check connections
psql -U maxistore_user -d maxistore_prod
```

### Rollback Procedure

```bash
# Stop current version
pm2 stop maxistore-backend

# Restore previous code
git checkout <previous-commit-or-tag>
npm ci --production

# Restore database (if migrations were run)
# Restore from backup taken before deployment

# Restart
pm2 restart maxistore-backend
```

## 📞 Support Resources

- **Server Access**: `ssh deploy@your-server-ip`
- **PM2 Logs**: `/var/www/maxistore-backend/backend/logs/`
- **PostgreSQL Logs**: `/var/log/postgresql/`
- **Nginx Logs**: `/var/log/nginx/`

---

**Remember**: Security is an ongoing process, not a one-time task. Regularly review and update security measures!
