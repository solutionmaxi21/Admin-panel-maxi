# 🏪 MaxiStore Backend API

Enterprise-grade backend API for MaxiStore e-commerce platform. Built with Node.js, Express, and PostgreSQL.

## 🚀 Features

- **Authentication & Authorization**: JWT-based auth with refresh tokens, Google OAuth
- **Product Management**: CRUD operations, inventory tracking, barcode support
- **Order Processing**: Order management, status tracking, shipping integration
- **User Management**: Customer accounts, admin panel, role-based access
- **Reviews & Ratings**: Product reviews, ratings, moderation
- **Offline Sync**: PWA support with HMAC-secured offline sync
- **Shipping Integration**: Guepex API integration for Algerian logistics
- **Real-time Notifications**: In-app notification system
- **Email System**: Order confirmations, password reset, verification emails
- **Caching**: Redis-like in-memory caching for performance
- **Security**: Helmet, CORS, rate limiting, input validation
- **Logging**: Structured logging with Pino
- **Performance**: Connection pooling, query optimization, clustering

## 📋 Prerequisites

- **Node.js**: v18.x or v20.x (LTS)
- **PostgreSQL**: v13+ (v15 recommended)
- **PM2**: For production process management
- **npm**: v9+ (comes with Node.js)

## 🛠️ Quick Start (Development)

### 1. Clone & Install

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with your values
nano .env
```

Minimum configuration for development:
```bash
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/maxistore
JWT_ACCESS_SECRET=your-secret-here
JWT_REFRESH_SECRET=your-secret-here
```

### 3. Setup Database

```bash
# Create PostgreSQL database
createdb maxistore

# Run migrations
npm run migrate:dev

# Optional: Seed with sample data
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

Server will start at `http://localhost:3001`

## 🔧 Available Scripts

### Development
- `npm run dev` - Start with nodemon (auto-reload)
- `npm run migrate:dev` - Run database migrations
- `npm run db:studio` - Open Prisma Studio (GUI for database)
- `npm run db:seed` - Seed database with sample data

### Production
- `npm start` - Start server (Node.js)
- `npm run start:prod` - Start with PM2 (production)
- `npm run migrate` - Deploy migrations to production
- `npm run stop` - Stop PM2 process
- `npm run restart` - Restart PM2 process
- `npm run logs` - View PM2 logs
- `npm run monit` - Monitor with PM2

### Testing
- `npm run test:smoke` - Quick smoke test
- `npm run test:api` - API functionality test
- `npm run test:load` - Load testing
- `npm run test:stress` - Stress testing
- `npm run test:all` - Run all tests

## 🏗️ Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   ├── db/              # Database connection
│   ├── services/        # Business logic
│   ├── shared/
│   │   ├── middleware/  # Express middleware
│   │   ├── utils/       # Utility functions
│   │   └── validators/  # Input validation
│   └── scripts/         # Utility scripts
├── routes/              # API routes
├── prisma/              # Database schema & migrations
├── logs/                # Application logs
├── uploads/             # File uploads
├── server.js            # Entry point
├── ecosystem.config.cjs # PM2 configuration
├── .env.example         # Environment template
└── DEPLOYMENT.md        # Deployment guide
```

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Reset password
- `POST /api/auth/google` - Google OAuth login

### Products
- `GET /api/products` - List products (with filters, pagination)
- `GET /api/products/:id` - Get product details
- `POST /api/products` - Create product (admin)
- `PUT /api/products/:id` - Update product (admin)
- `DELETE /api/products/:id` - Delete product (admin)

### Orders
- `GET /api/orders` - List orders
- `GET /api/orders/:id` - Get order details
- `POST /api/orders` - Create order
- `PUT /api/orders/:id` - Update order
- `POST /api/orders/:id/cancel` - Cancel order

### Users
- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users` - List users (admin)

### Health Check
- `GET /api/health` - Health check with database & cache status

**Full API documentation**: See Postman collection in `/backend/postman/`

## 🔒 Security Features

- **Helmet**: Security headers
- **CORS**: Configurable cross-origin requests
- **Rate Limiting**: Prevent brute force attacks
- **Input Validation**: Zod schema validation
- **SQL Injection Protection**: Parameterized queries
- **XSS Protection**: Input sanitization
- **JWT Authentication**: Secure token-based auth
- **HMAC Verification**: Offline sync security
- **Password Hashing**: bcrypt with configurable salt rounds

## 🚀 Production Deployment

**Complete deployment guide**: See [DEPLOYMENT.md](DEPLOYMENT.md)

**Quick Production Setup:**

```bash
# 1. Install dependencies
npm ci --production

# 2. Configure environment
cp .env.example .env
nano .env  # Fill in production values

# 3. Run migrations
npm run migrate

# 4. Start with PM2
npm run start:prod

# 5. Save PM2 process
pm2 save
pm2 startup
```

**Production Checklist**: See [PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md)

## 📊 Monitoring

### PM2 Monitoring

```bash
# View status
pm2 status

# View logs
pm2 logs maxistore-backend

# Real-time monitoring
pm2 monit

# View metrics
pm2 describe maxistore-backend
```

### Health Check

```bash
# Test health endpoint
curl http://localhost:3001/api/health

# Expected response:
{
  "success": true,
  "status": "ok",
  "services": {
    "database": {
      "status": "connected",
      "responseTime": "5ms"
    },
    "cache": {
      "status": "active",
      "hitRate": "85%"
    }
  }
}
```

## 🗄️ Database

### Migrations

```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Deploy to production
npm run migrate

# Reset database (WARNING: destroys data)
npx prisma migrate reset
```

### Database Studio

```bash
# Open GUI for database
npm run db:studio
```

### Backup & Restore

```bash
# Backup
pg_dump -U postgres maxistore > backup.sql

# Restore
psql -U postgres maxistore < backup.sql
```

## 🧪 Testing

### Load Testing (k6)

```bash
# Smoke test (quick validation)
npm run test:smoke

# Load test (simulates realistic load)
npm run test:load

# Stress test (find breaking point)
npm run test:stress

# View results
cat k6/results/results.json
```

## 🛠️ Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs maxistore-backend --err

# Check port availability
lsof -i :3001

# Check environment
node -e "require('dotenv').config(); console.log(process.env.PORT)"
```

### Database Connection Issues

```bash
# Test PostgreSQL
psql -U postgres -d maxistore

# Check connection string
echo $DATABASE_URL

# Verify database exists
psql -U postgres -l | grep maxistore
```

### Permission Issues

```bash
# Fix logs directory
chmod 755 logs

# Fix uploads directory
chmod 755 uploads

# Fix .env permissions
chmod 600 .env
```

## 📝 Environment Variables

See [.env.example](.env.example) for complete list.

**Critical variables:**
- `NODE_ENV` - Environment (development/production)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_ACCESS_SECRET` - JWT access token secret
- `JWT_REFRESH_SECRET` - JWT refresh token secret
- `ALLOWED_ORIGINS` - CORS allowed origins

## 🤝 Contributing

1. Create feature branch (`git checkout -b feature/amazing-feature`)
2. Commit changes (`git commit -m 'Add amazing feature'`)
3. Push to branch (`git push origin feature/amazing-feature`)
4. Open Pull Request

## 📄 License

MIT License - See LICENSE file for details

## 🆘 Support

- **Issues**: Open an issue on GitHub
- **Documentation**: See `/backend/docs/`
- **API Collection**: Import Postman collection from `/backend/postman/`

## 🔗 Related Projects

- **Frontend**: Next.js e-commerce storefront
- **Admin Panel**: Electron-based desktop admin app

---

**Built with ❤️ for the Algerian hardware market**
