try { require('dotenv').config(); } catch (e) {}
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const databaseUrl = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === 'production';

let pool = null;

if (databaseUrl) {
  const poolConfig = {
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  // Enable SSL for remote cloud databases (Render, Supabase, Neon, AWS RDS, etc.)
  if (isProduction || databaseUrl.includes('render.com') || databaseUrl.includes('supabase') || databaseUrl.includes('neon') || databaseUrl.includes('sslmode=require')) {
    poolConfig.ssl = {
      rejectUnauthorized: false
    };
  }

  pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err.message);
  });
} else {
  if (isProduction) {
    console.error('❌ FATAL: DATABASE_URL environment variable is required in production. Please set DATABASE_URL on Render.');
  } else {
    console.warn('⚠️ WARNING: DATABASE_URL environment variable is not set.');
    console.warn('ℹ️ Please configure DATABASE_URL in your .env file or Render dashboard.');
    // Local development fallback
    pool = new Pool({
      connectionString: 'postgresql://postgres:postgres@localhost:5432/roterpay',
      max: 10,
      connectionTimeoutMillis: 2000,
    });
    pool.on('error', () => {});
  }
}

// Automatic placeholder converter: replaces ? with $1, $2, $3...
function convertPlaceholders(sql) {
  if (!sql || typeof sql !== 'string') return sql;
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

// PostgreSQL Database Wrapper & Helper Interface
const db = {
  pool,

  // Execute a query and return all matching rows
  async queryAll(sql, params = []) {
    if (!pool) return [];
    try {
      const formattedSql = convertPlaceholders(sql);
      const res = await pool.query(formattedSql, params);
      return res.rows || [];
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || !databaseUrl) {
        console.warn('⚠️ Local DB Query Warning:', err.message);
        return [];
      }
      console.error('PostgreSQL queryAll error:', err.message, '| SQL:', sql);
      throw err;
    }
  },

  // Execute a query and return a single row (or null)
  async queryOne(sql, params = []) {
    if (!pool) return null;
    try {
      const formattedSql = convertPlaceholders(sql);
      const res = await pool.query(formattedSql, params);
      return res.rows[0] || null;
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || !databaseUrl) {
        console.warn('⚠️ Local DB Query Warning:', err.message);
        return null;
      }
      console.error('PostgreSQL queryOne error:', err.message, '| SQL:', sql);
      throw err;
    }
  },

  // Execute an INSERT/UPDATE/DELETE query
  async run(sql, params = []) {
    if (!pool) return { rowCount: 0, changes: 0, rows: [] };
    try {
      const formattedSql = convertPlaceholders(sql);
      const res = await pool.query(formattedSql, params);
      return {
        rowCount: res.rowCount,
        changes: res.rowCount,
        rows: res.rows
      };
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || !databaseUrl) {
        console.warn('⚠️ Local DB Run Warning:', err.message);
        return { rowCount: 0, changes: 0, rows: [] };
      }
      console.error('PostgreSQL run error:', err.message, '| SQL:', sql);
      throw err;
    }
  },

  // Execute multiple operations within an atomic PostgreSQL transaction
  async tx(callback) {
    if (!pool) throw new Error('Database connection pool is not configured');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const txHelper = {
        queryAll: async (sql, params = []) => {
          const res = await client.query(convertPlaceholders(sql), params);
          return res.rows || [];
        },
        queryOne: async (sql, params = []) => {
          const res = await client.query(convertPlaceholders(sql), params);
          return res.rows[0] || null;
        },
        run: async (sql, params = []) => {
          const res = await client.query(convertPlaceholders(sql), params);
          return { rowCount: res.rowCount, changes: res.rowCount, rows: res.rows };
        }
      };
      const result = await callback(txHelper);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Transaction rolled back due to error:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }
};

// Initialize All PostgreSQL Tables & Seed Default Records
async function initializeTables() {
  if (!pool) {
    if (isProduction) {
      throw new Error('DATABASE_URL environment variable is missing in production');
    }
    return;
  }
  try {
    // 0. Admins Table (Secure PostgreSQL Stored Admin Credentials)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 1. Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        balance DOUBLE PRECISION DEFAULT 0.0,
        deposit DOUBLE PRECISION DEFAULT 0.0,
        withdrawal DOUBLE PRECISION DEFAULT 0.0,
        commission DOUBLE PRECISION DEFAULT 0.0,
        scorePoints INTEGER DEFAULT 500,
        sellTotal DOUBLE PRECISION DEFAULT 0.0,
        cashbackReward DOUBLE PRECISION DEFAULT 0.0,
        cashbackPending DOUBLE PRECISION DEFAULT 0.0,
        status TEXT DEFAULT 'ACTIVE',
        referralCode TEXT DEFAULT '',
        hasClaimedDevCredit INTEGER DEFAULT 0,
        createdAt TEXT
      );
    `);

    // 2. Stats & Settings Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stats_data (
        id INTEGER PRIMARY KEY,
        exchangeRate DOUBLE PRECISION DEFAULT 110.0,
        scoreRate DOUBLE PRECISION DEFAULT 10.0,
        inProcessAmount DOUBLE PRECISION DEFAULT 0.0,
        inProcessOrders INTEGER DEFAULT 0,
        commissionRate DOUBLE PRECISION DEFAULT 4.0,
        estimatedIncome DOUBLE PRECISION DEFAULT 0.0,
        isSellingOpen INTEGER DEFAULT 0,
        specialRewardActive INTEGER DEFAULT 1,
        maintenanceMode INTEGER DEFAULT 0,
        adminUpiId TEXT DEFAULT '8104229900@upi',
        merchantName TEXT DEFAULT 'Fintech Hub',
        adminQrText TEXT DEFAULT 'Scan & Pay via GPay / PhonePe / Paytm',
        appVersion TEXT DEFAULT 'v1.1.9',
        appDownloadUrl TEXT DEFAULT '/downloads/fintech-hub.apk',
        date TEXT
      );
    `);

    // 3. Deposit Buy Orders Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deposit_buy_orders (
        id BIGINT PRIMARY KEY,
        userId TEXT NOT NULL,
        userName TEXT,
        orderType TEXT DEFAULT 'Deposit',
        amount DOUBLE PRECISION NOT NULL,
        usdtAmount DOUBLE PRECISION,
        status TEXT DEFAULT 'Success',
        paymentChannel TEXT DEFAULT 'UPI Direct',
        utrNumber TEXT,
        matchedNote TEXT,
        timestamp TEXT
      );
    `);

    // 4. Sell Orders Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sell_orders (
        id BIGINT PRIMARY KEY,
        userId TEXT NOT NULL,
        userName TEXT,
        orderType TEXT DEFAULT 'Sell',
        amount DOUBLE PRECISION NOT NULL,
        usdtAmount DOUBLE PRECISION,
        status TEXT DEFAULT 'Pending',
        payoutBank TEXT,
        accountNumber TEXT,
        p2pMatchedWith TEXT,
        matchedNote TEXT,
        timestamp TEXT
      );
    `);

    // 5. Transactions Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id BIGINT PRIMARY KEY,
        userId TEXT NOT NULL,
        type TEXT,
        amount DOUBLE PRECISION,
        income DOUBLE PRECISION DEFAULT 0.0,
        status TEXT DEFAULT 'Completed',
        timestamp TEXT
      );
    `);

    // 6. Notifications Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT PRIMARY KEY,
        title TEXT,
        body TEXT,
        type TEXT,
        isRead INTEGER DEFAULT 0,
        time TEXT,
        targetUserId TEXT DEFAULT 'ALL'
      );
    `);

    // 7. Payment Claim Offers Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_offers (
        id INTEGER PRIMARY KEY,
        amount DOUBLE PRECISION,
        code TEXT UNIQUE,
        income DOUBLE PRECISION,
        specialBonus DOUBLE PRECISION,
        category TEXT
      );
    `);

    // 8. User Payment Wallets Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_wallets (
        id BIGINT PRIMARY KEY,
        userId TEXT,
        userName TEXT,
        name TEXT,
        address TEXT,
        holderName TEXT,
        type TEXT DEFAULT 'Personal',
        createdAt TEXT
      );
    `);

    // 9. Score Conversions Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS score_conversions (
        id BIGINT PRIMARY KEY,
        userId TEXT NOT NULL,
        pointsConverted INTEGER,
        inrReceived DOUBLE PRECISION,
        timestamp TEXT
      );
    `);

    // 10. Audit Logs Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT PRIMARY KEY,
        action TEXT,
        detail TEXT,
        ip TEXT,
        timestamp TEXT
      );
    `);

    // 11. User Claimed Offers Tracking Table (1 claim per offer per day limit)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_claimed_offers (
        id SERIAL PRIMARY KEY,
        userId TEXT NOT NULL,
        offerId INTEGER NOT NULL,
        offerCode TEXT,
        claimedDate TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
    `);

    // 12. Real-Time Live Support Chat Messages Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id SERIAL PRIMARY KEY,
        userId TEXT NOT NULL,
        userName TEXT,
        sender TEXT NOT NULL,
        message TEXT NOT NULL,
        isRead INTEGER DEFAULT 0,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Performance Indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_claimed_lookup ON user_claimed_offers(userId, offerId, claimedDate);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(userId, timestamp DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_deposit_orders_user ON deposit_buy_orders(userId, timestamp DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sell_orders_user ON sell_orders(userId, timestamp DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_support_user_time ON support_messages(userId, timestamp ASC);`);

    // Seed initial admin account ONLY if admins table has 0 records and credentials are configured
    const adminCheck = await pool.query(`SELECT COUNT(*) as count FROM admins`);
    const adminCount = Number(adminCheck.rows[0]?.count || 0);
    if (adminCount === 0 && process.env.ADMIN_PASSCODE) {
      const initialUsername = String(process.env.ADMIN_USERNAME || 'admin').trim();
      const initialPasscode = String(process.env.ADMIN_PASSCODE).trim();
      const initialHash = await bcrypt.hash(initialPasscode, 10);
      await pool.query(
        `INSERT INTO admins (username, password_hash, role, status) VALUES ($1, $2, 'admin', 'ACTIVE') ON CONFLICT (username) DO NOTHING;`,
        [initialUsername, initialHash]
      );
      console.log(`🔐 Initial PostgreSQL Admin created: ${initialUsername}`);
    }

    // Safe startup reporting for admin records count
    const finalAdminCheck = await pool.query(`SELECT COUNT(*) as count FROM admins`);
    const finalCount = Number(finalAdminCheck.rows[0]?.count || 0);
    console.log(`Admin records: ${finalCount}`);

    // Seed default stats if not existing
    await pool.query(`
      INSERT INTO stats_data (id, exchangeRate, scoreRate, inProcessAmount, inProcessOrders, commissionRate, estimatedIncome, isSellingOpen, specialRewardActive, maintenanceMode, adminUpiId, merchantName, adminQrText, appVersion, appDownloadUrl, date)
      VALUES (1, 110.0, 10.0, 0.0, 0, 4.0, 0.0, 0, 1, 0, '8104229900@upi', 'Fintech Hub', 'Scan & Pay via GPay / PhonePe / Paytm', 'v1.1.9', '/downloads/fintech-hub.apk', CURRENT_DATE::text)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed default offers if not existing
    await pool.query(`
      INSERT INTO payment_offers (id, amount, code, income, specialBonus, category)
      VALUES 
        (101, 150, 'OFFER-150', 20.0, 5.0, '100-300'),
        (102, 500, 'OFFER-500', 65.0, 15.0, '300-1000'),
        (103, 2000, 'OFFER-2000', 260.0, 50.0, '1000+')
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('✅ PostgreSQL Schema initialized successfully. All tables verified.');
  } catch (err) {
    console.error('⚠️ PostgreSQL Schema initialization error:', err.message);
    if (isProduction) {
      throw err;
    }
  }
}

// Kick off table initialization and export promise
db.initPromise = initializeTables();

module.exports = db;
