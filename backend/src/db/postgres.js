/**
 * PostgreSQL Connection Pool
 * Singleton connection pool for database operations
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

class Database {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  /**
   * Initialize connection pool
   */
  async connect() {
    if (this.isConnected) {
      return this.pool;
    }

    try {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: parseInt(process.env.DB_MAX_CONNECTIONS || '20'), // Maximum pool size
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000, // Fail fast (5s)
        keepAlive: true, // Prevent timeouts
      });

      // Neon, RDS Proxy et la plupart des bases managees ferment les connexions
      // OISIVES : Neon endort le compute apres ~5 minutes d'inactivite, et toute
      // connexion encore ouverte dans le pool est coupee cote serveur.
      //
      // node-postgres ne signale PAS ce cas par le rejet de la requete en cours,
      // mais par un evenement 'error' sur le Pool — c'est-a-dire exactement le
      // cas que le try/catch de query() ci-dessous ne peut pas couvrir, puisqu'
      // aucune requete n'est en vol au moment ou la connexion meurt.
      //
      // Un EventEmitter qui emet 'error' sans ecouteur RELANCE l'exception :
      // le processus Node meurt. Sur un hebergeur qui redemarre le conteneur,
      // cela produit une boucle de redemarrage a chaque reveil de la base.
      //
      // Le pool retire de lui-meme le client fautif ; absorber l'evenement suffit
      // pour que la requete suivante ouvre une connexion neuve. keepAlive: true
      // n'aide pas ici : c'est un keepalive TCP sur la socket, il n'empeche pas
      // le serveur de fermer la session.
      this.pool.on('error', (error) => {
        console.error('⚠️ Idle PostgreSQL client error (pool recovers):', error.message);
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      console.log('✓ PostgreSQL connected successfully');

      return this.pool;
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error.message);
      throw error;
    }
  }

  /**
   * Execute a query
   */
  async query(text, params = []) {
    if (!this.isConnected) {
      await this.connect();
    }

    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const start = Date.now();
        const result = await this.pool.query(text, params);

        if (process.env.LOG_QUERIES === 'true') {
          const duration = Date.now() - start;
          console.log('Query executed:', { duration, rows: result.rowCount });
        }

        return result;
      } catch (error) {
        lastError = error;

        // Check for retryable errors: Connection terminated, Timeout, Admin Shutdown
        const isRetryable =
          error.message.includes('Connection terminated') ||
          error.code === 'ETIMEDOUT' ||
          error.code === '57P01';

        if (isRetryable && attempt < maxRetries) {
          // Sanitized logging: No SQL, just error code and attempt count
          console.warn(`⚠️ Database retry (attempt ${attempt}/${maxRetries}). Code: ${error.code || 'UNKNOWN'}`);
          // Backoff: 500ms, 1000ms...
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          continue;
        }

        // Not retryable or max retries reached
        console.error('Query error:', error.message);
        // Important: We do not log the query text here as requested for security
        throw error;
      }
    }
  }

  /**
   * Execute query and return single row
   */
  async queryOne(text, params = []) {
    const result = await this.query(text, params);
    return result.rows[0] || null;
  }

  /**
   * Execute query and return all rows
   */
  async queryMany(text, params = []) {
    const result = await this.query(text, params);
    return result.rows;
  }

  /**
   * Begin transaction
   */
  async beginTransaction() {
    const client = await this.pool.connect();
    await client.query('BEGIN');
    return client;
  }

  /**
   * Commit transaction
   */
  async commit(client) {
    try {
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }

  /**
   * Rollback transaction
   */
  async rollback(client) {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(callback) {
    const client = await this.beginTransaction();

    try {
      const result = await callback(client);
      await this.commit(client);
      return result;
    } catch (error) {
      await this.rollback(client);
      throw error;
    }
  }

  /**
   * Batch insert with conflict handling
   */
  async batchInsert(tableName, columns, values, onConflict = '') {
    if (!values || values.length === 0) {
      return { rowCount: 0 };
    }

    // Validate identifiers to prevent SQL injection
    this._assertSafeIdentifier(tableName, 'table name');
    columns.forEach(col => this._assertSafeIdentifier(col, 'column name'));

    const placeholders = values.map((_, rowIndex) => {
      const rowPlaceholders = columns.map((_, colIndex) => {
        return `$${rowIndex * columns.length + colIndex + 1}`;
      });
      return `(${rowPlaceholders.join(', ')})`;
    }).join(', ');

    const flatValues = values.flat();
    const columnList = columns.join(', ');

    const query = `
      INSERT INTO ${tableName} (${columnList})
      VALUES ${placeholders}
      ${onConflict}
      RETURNING *
    `;

    return await this.query(query, flatValues);
  }

  /**
   * Check if table exists
   */
  async tableExists(tableName) {
    const result = await this.queryOne(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )`,
      [tableName]
    );
    return result.exists;
  }

  /**
   * Validate that a table name is a safe SQL identifier (letters, digits, underscores only)
   */
  _assertSafeIdentifier(name, label = 'identifier') {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Unsafe ${label}: ${name}`);
    }
  }

  /**
   * Get table row count
   */
  async getTableCount(tableName) {
    this._assertSafeIdentifier(tableName, 'table name');
    const result = await this.queryOne(`SELECT COUNT(*) FROM ${tableName}`);
    return parseInt(result.count);
  }

  /**
   * Truncate table
   */
  async truncateTable(tableName, cascade = false) {
    this._assertSafeIdentifier(tableName, 'table name');
    const cascadeStr = cascade ? 'CASCADE' : '';
    await this.query(`TRUNCATE TABLE ${tableName} ${cascadeStr}`);
  }

  /**
   * Close all connections
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('✓ PostgreSQL connection pool closed');
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    if (!this.pool) return null;

    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount
    };
  }
}

// Export singleton instance
const db = new Database();
export default db;
