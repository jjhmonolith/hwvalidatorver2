import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Database configuration
// SSL: Use DATABASE_SSL env var to control behavior
// - "true" or "1": Enable SSL with certificate validation
// - "require": Enable SSL without validation (for Railway/Heroku)
// - "false" or "0": Disable SSL (local development)
const sslConfig = (() => {
  const sslEnv = process.env.DATABASE_SSL;
  if (sslEnv === 'require') {
    // Railway/Heroku style - require SSL but don't validate cert
    return { rejectUnauthorized: false };
  }
  if (sslEnv === 'true' || sslEnv === '1') {
    return { rejectUnauthorized: true };
  }
  if (process.env.NODE_ENV === 'production' && !sslEnv) {
    // Default to require SSL in production
    return { rejectUnauthorized: false };
  }
  return false;
})();

const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 5000, // How long to wait for a connection
};

// Create the connection pool
const pool = new Pool(dbConfig);

// Test the connection
pool.on('connect', () => {
  console.log('Database pool connected');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Query helper function
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
}

// Get a client from the pool for transactions
export async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const release = client.release.bind(client);

  // Set a timeout for automatic release
  const timeout = setTimeout(() => {
    console.error('Client has been checked out for too long!');
    client.release();
  }, 30000);

  client.query = (...args) => originalQuery(...args);
  client.release = () => {
    clearTimeout(timeout);
    return release();
  };

  return client;
}

// Transaction helper
export async function transaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Health check
export async function checkHealth() {
  try {
    const result = await query('SELECT NOW()');
    return { status: 'ok', timestamp: result.rows[0].now };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

// Close the pool (for graceful shutdown)
export async function closePool() {
  await pool.end();
  console.log('Database pool closed');
}

export default {
  query,
  getClient,
  transaction,
  checkHealth,
  closePool,
  pool,
};
