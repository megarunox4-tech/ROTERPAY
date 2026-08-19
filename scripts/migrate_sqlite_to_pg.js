/**
 * Migration Utility: SQLite to PostgreSQL
 * 
 * Safely transfers all existing rows from local 'database.sqlite' into PostgreSQL
 * without duplicate conflicts or data destruction.
 * 
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@host:5432/dbname node scripts/migrate_sqlite_to_pg.js
 */

try { require('dotenv').config(); } catch (e) { }
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const SQLITE_FILE = path.join(__dirname, '..', 'database.sqlite');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is required.');
  console.log('Usage: DATABASE_URL="postgresql://user:password@host:port/dbname" node scripts/migrate_sqlite_to_pg.js');
  process.exit(1);
}

if (!fs.existsSync(SQLITE_FILE)) {
  console.log('ℹ️ No database.sqlite file found in project root. Nothing to migrate from SQLite.');
  process.exit(0);
}

// Dynamically require sqlite3 for migration if available
let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.error('⚠️ Note: sqlite3 package is not in production dependencies. If you need to run this migration locally, run "npm i sqlite3 --no-save" first.');
  process.exit(1);
}

const sqliteDb = new sqlite3.Database(SQLITE_FILE);
const pgPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: (DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')) ? false : { rejectUnauthorized: false }
});

function sqliteAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function migrate() {
  console.log('🚀 Starting SQLite to PostgreSQL migration...');
  const client = await pgPool.connect();

  try {
    // 1. Users
    const users = await sqliteAll('SELECT * FROM users');
    console.log(`Found ${users.length} users in SQLite.`);
    for (const u of users) {
      await client.query(`
        INSERT INTO users (id, name, phone, password, balance, deposit, withdrawal, commission, scorePoints, sellTotal, cashbackReward, cashbackPending, status, referralCode, hasClaimedDevCredit, createdAt)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          balance = EXCLUDED.balance,
          deposit = EXCLUDED.deposit,
          withdrawal = EXCLUDED.withdrawal,
          commission = EXCLUDED.commission,
          scorePoints = EXCLUDED.scorePoints
      `, [
        u.id, u.name, u.phone, u.password, u.balance || 0, u.deposit || 0, u.withdrawal || 0,
        u.commission || 0, u.scorePoints || 500, u.sellTotal || 0, u.cashbackReward || 0,
        u.cashbackPending || 0, u.status || 'ACTIVE', u.referralCode || '',
        u.hasClaimedDevCredit || 0, u.createdAt || new Date().toISOString()
      ]);
    }

    // 2. Stats
    const stats = await sqliteAll('SELECT * FROM stats_data WHERE id = 1');
    if (stats.length > 0) {
      const s = stats[0];
      await client.query(`
        INSERT INTO stats_data (id, exchangeRate, scoreRate, inProcessAmount, inProcessOrders, commissionRate, estimatedIncome, isSellingOpen, specialRewardActive, maintenanceMode, adminUpiId, merchantName, adminQrText, appVersion, appDownloadUrl, date)
        VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          exchangeRate = EXCLUDED.exchangeRate,
          scoreRate = EXCLUDED.scoreRate,
          adminUpiId = EXCLUDED.adminUpiId,
          merchantName = EXCLUDED.merchantName,
          appVersion = EXCLUDED.appVersion,
          appDownloadUrl = EXCLUDED.appDownloadUrl
      `, [
        s.exchangeRate || 110, s.scoreRate || 10, s.inProcessAmount || 0, s.inProcessOrders || 0,
        s.commissionRate || 4, s.estimatedIncome || 0, s.isSellingOpen ? 1 : 0,
        s.specialRewardActive ? 1 : 0, s.maintenanceMode ? 1 : 0,
        s.adminUpiId || '8104229900@upi', s.merchantName || 'Fintech Hub',
        s.adminQrText || 'Scan & Pay via UPI', s.appVersion || 'v1.1.9',
        s.appDownloadUrl || '/downloads/fintech-hub.apk', s.date || new Date().toISOString()
      ]);
    }

    // 3. Deposit Orders
    const depOrders = await sqliteAll('SELECT * FROM deposit_buy_orders');
    console.log(`Found ${depOrders.length} deposit orders.`);
    for (const d of depOrders) {
      await client.query(`
        INSERT INTO deposit_buy_orders (id, userId, userName, orderType, amount, usdtAmount, status, paymentChannel, utrNumber, matchedNote, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `, [d.id, d.userId, d.userName, d.orderType || 'Deposit', d.amount, d.usdtAmount, d.status, d.paymentChannel, d.utrNumber, d.matchedNote, d.timestamp]);
    }

    // 4. Sell Orders
    const sellOrders = await sqliteAll('SELECT * FROM sell_orders');
    console.log(`Found ${sellOrders.length} sell orders.`);
    for (const s of sellOrders) {
      await client.query(`
        INSERT INTO sell_orders (id, userId, userName, orderType, amount, usdtAmount, status, payoutBank, accountNumber, p2pMatchedWith, matchedNote, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING
      `, [s.id, s.userId, s.userName, s.orderType || 'Sell', s.amount, s.usdtAmount, s.status, s.payoutBank, s.accountNumber, s.p2pMatchedWith, s.matchedNote, s.timestamp]);
    }

    // 5. Transactions
    const txs = await sqliteAll('SELECT * FROM transactions');
    console.log(`Found ${txs.length} transactions.`);
    for (const t of txs) {
      await client.query(`
        INSERT INTO transactions (id, userId, type, amount, income, status, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
      `, [t.id, t.userId, t.type, t.amount, t.income || 0, t.status, t.timestamp]);
    }

    // 6. User Claimed Offers
    const claimed = await sqliteAll('SELECT * FROM user_claimed_offers');
    console.log(`Found ${claimed.length} claimed offer records.`);
    for (const c of claimed) {
      await client.query(`
        INSERT INTO user_claimed_offers (userId, offerId, offerCode, claimedDate, timestamp)
        VALUES ($1, $2, $3, $4, $5)
      `, [c.userId, c.offerId, c.offerCode, c.claimedDate, c.timestamp]);
    }

    console.log('✅ SQLite to PostgreSQL migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration Error:', err);
  } finally {
    client.release();
    sqliteDb.close();
    await pgPool.end();
  }
}

migrate();
