import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

/**
 * Prisma Client Singleton
 * 
 * This ensures we don't create multiple instances of PrismaClient
 * which can exhaust database connections in development with hot reload.
 */

const globalForPrisma = globalThis;

// Create PostgreSQL connection pool
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Connect to database
 * Call this during server startup
 */
export const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
};

/**
 * Disconnect from database
 * Call this during graceful shutdown
 */
export const disconnectDB = async () => {
  try {
    await prisma.$disconnect();
    console.log('📴 Database disconnected');
  } catch (error) {
    console.error('Error disconnecting from database:', error);
  }
};

/**
 * Health check for database
 */
export const checkDBHealth = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', message: 'Database connection is active' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

export default prisma;
