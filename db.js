const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

// Promisified SQL query helper methods
const sqlDb = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },

  queryAll(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },

  queryOne(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }
};

// Initialize All Relational SQL Tables
function initializeTables() {
  db.serialize(async () => {
    // 1. Users Table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        balance REAL DEFAULT 0.0,
        deposit REAL DEFAULT 0.0,
        withdrawal REAL DEFAULT 0.0,
        commission REAL DEFAULT 0.0,
        scorePoints INTEGER DEFAULT 500,
        sellTotal REAL DEFAULT 0.0,
        cashbackReward REAL DEFAULT 0,
        cashbackPending REAL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        referralCode TEXT DEFAULT '',
        hasClaimedDevCredit INTEGER DEFAULT 0,
        createdAt TEXT
      )
    `);

    // 2. Stats & Settings Table
    db.run(`
      CREATE TABLE IF NOT EXISTS stats_data (
        id INTEGER PRIMARY KEY,
        exchangeRate REAL DEFAULT 110.0,
        scoreRate REAL DEFAULT 10.0,
        inProcessAmount REAL DEFAULT 0.0,
        inProcessOrders INTEGER DEFAULT 0,
        commissionRate REAL DEFAULT 4.0,
        estimatedIncome REAL DEFAULT 0.0,
        isSellingOpen INTEGER DEFAULT 0,
        specialRewardActive INTEGER DEFAULT 1,
        maintenanceMode INTEGER DEFAULT 0,
        adminUpiId TEXT DEFAULT '8104229900@upi',
        merchantName TEXT DEFAULT 'Fintech Hub',
        adminQrText TEXT DEFAULT 'Scan & Pay via GPay / PhonePe / Paytm',
        appVersion TEXT DEFAULT 'v1.1.9',
        appDownloadUrl TEXT DEFAULT '/downloads/fintech-hub.apk',
        date TEXT
      )
    `);

    // Ensure appDownloadUrl column exists if table was already created
    db.run(`ALTER TABLE stats_data ADD COLUMN appDownloadUrl TEXT DEFAULT '/downloads/fintech-hub.apk'`, () => {});

    // 3. Deposit Buy Orders Table
    db.run(`
      CREATE TABLE IF NOT EXISTS deposit_buy_orders (
        id INTEGER PRIMARY KEY,
        userId TEXT NOT NULL,
        userName TEXT,
        orderType TEXT DEFAULT 'Deposit',
        amount REAL NOT NULL,
        usdtAmount REAL,
        status TEXT DEFAULT 'Success',
        paymentChannel TEXT DEFAULT 'UPI Direct',
        utrNumber TEXT,
        matchedNote TEXT,
        timestamp TEXT
      )
    `);

    // 4. Sell Orders Table
    db.run(`
      CREATE TABLE IF NOT EXISTS sell_orders (
        id INTEGER PRIMARY KEY,
        userId TEXT NOT NULL,
        userName TEXT,
        orderType TEXT DEFAULT 'Sell',
        amount REAL NOT NULL,
        usdtAmount REAL,
        status TEXT DEFAULT 'Pending',
        payoutBank TEXT,
        accountNumber TEXT,
        p2pMatchedWith TEXT,
        matchedNote TEXT,
        timestamp TEXT
      )
    `);

    // 5. Transactions Table
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY,
        userId TEXT NOT NULL,
        type TEXT,
        amount REAL,
        income REAL DEFAULT 0.0,
        status TEXT DEFAULT 'Completed',
        timestamp TEXT
      )
    `);

    // 6. Notifications Table
    db.run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY,
        title TEXT,
        body TEXT,
        type TEXT,
        isRead INTEGER DEFAULT 0,
        time TEXT,
        targetUserId TEXT DEFAULT 'ALL'
      )
    `);

    // 7. Payment Claim Offers Table
    db.run(`
      CREATE TABLE IF NOT EXISTS payment_offers (
        id INTEGER PRIMARY KEY,
        amount REAL,
        code TEXT UNIQUE,
        income REAL,
        specialBonus REAL,
        category TEXT
      )
    `);

    // 8. User Payment Wallets Table
    db.run(`
      CREATE TABLE IF NOT EXISTS user_wallets (
        id INTEGER PRIMARY KEY,
        userId TEXT,
        userName TEXT,
        name TEXT,
        address TEXT,
        holderName TEXT,
        type TEXT DEFAULT 'Personal',
        createdAt TEXT
      )
    `);

    // 9. Score Conversions Table
    db.run(`
      CREATE TABLE IF NOT EXISTS score_conversions (
        id INTEGER PRIMARY KEY,
        userId TEXT NOT NULL,
        pointsConverted INTEGER,
        inrReceived REAL,
        timestamp TEXT
      )
    `);

    // 10. Audit Logs Table
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY,
        action TEXT,
        detail TEXT,
        ip TEXT,
        timestamp TEXT
      )
    `);

    // 11. User Claimed Offers Tracking Table (1 claim per offer per day limit)
    db.run(`
      CREATE TABLE IF NOT EXISTS user_claimed_offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        offerId INTEGER NOT NULL,
        offerCode TEXT,
        claimedDate TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);

    // Seed default stats if not existing
    db.get(`SELECT COUNT(*) as count FROM stats_data`, async (err, row) => {
      if (!err && row && row.count === 0) {
        db.run(`
          INSERT INTO stats_data (id, exchangeRate, scoreRate, inProcessAmount, inProcessOrders, commissionRate, estimatedIncome, isSellingOpen, specialRewardActive, maintenanceMode, adminUpiId, merchantName, adminQrText, appVersion, date)
          VALUES (1, 110.0, 10.0, 0.0, 0, 4.0, 0.0, 0, 1, 0, '8104229900@upi', 'Fintech Hub', 'Scan & Pay via GPay / PhonePe / Paytm', 'v1.1.9', '${new Date().toLocaleDateString('en-GB')}')
        `);
      }
    });

    // Seed default offers if not existing
    db.get(`SELECT COUNT(*) as count FROM payment_offers`, async (err, row) => {
      if (!err && row && row.count === 0) {
        db.run(`INSERT INTO payment_offers (id, amount, code, income, specialBonus, category) VALUES (101, 150, 'OFFER-150', 20.0, 5.0, '100-300')`);
        db.run(`INSERT INTO payment_offers (id, amount, code, income, specialBonus, category) VALUES (102, 500, 'OFFER-500', 65.0, 15.0, '300-1000')`);
        db.run(`INSERT INTO payment_offers (id, amount, code, income, specialBonus, category) VALUES (103, 2000, 'OFFER-2000', 260.0, 50.0, '1000+')`);
      }
    });
  });
}

initializeTables();

module.exports = sqlDb;
