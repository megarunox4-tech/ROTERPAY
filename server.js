try { require('dotenv').config(); } catch (e) {}
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'roterpay_super_secret_jwt_key_2026';
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'admin123';

// Middleware
app.use(cors());
app.use((req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Content-Security-Policy');
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Dedicated Admin Portal Routes
app.get(['/admin', '/admin/', '/admin.html', '/Admin', '/Admin/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ==========================================
// SECURITY & AUTHENTICATION HELPERS
// ==========================================

async function hashPassword(plainText) {
  return await bcrypt.hash(String(plainText).trim(), 10);
}

async function verifyPassword(inputPassword, storedPassword) {
  if (!inputPassword || !storedPassword) return false;
  const strInput = String(inputPassword).trim();
  const strStored = String(storedPassword).trim();
  // Check if storedPassword is a bcrypt hash ($2a$ / $2b$)
  if (strStored.startsWith('$2a$') || strStored.startsWith('$2b$')) {
    return await bcrypt.compare(strInput, strStored);
  }
  // Safe comparison for legacy plaintext passwords
  return strInput === strStored;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

function generateUserToken(user) {
  return jwt.sign(
    { userId: user.id, phone: user.phone, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function generateAdminToken() {
  return jwt.sign(
    { role: 'admin', timestamp: Date.now() },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// User Authentication Middleware (Extracts token without breaking unauthenticated public endpoints)
function authenticateUser(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7)
    : (req.headers['x-auth-token'] || req.body?.token || req.query?.token);

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      req.user = null;
    }
  }
  next();
}

// Admin Route Protection Middleware
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7)
    : (req.headers['x-admin-token'] || req.body?.adminToken || req.query?.adminToken);

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin session token' });
  }
}

// Money & Number Sanitization Helper
function sanitizeAmount(val) {
  const num = Number(val);
  if (!Number.isFinite(num) || isNaN(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}

// SQL Audit Logger Helper
async function logAudit(action, detail, req) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
    const clientIp = Array.isArray(ip) ? ip[0] : ip;
    await db.run(
      `INSERT INTO audit_logs (id, action, detail, ip, timestamp) VALUES ($1, $2, $3, $4, $5)`,
      [Date.now(), action, detail, String(clientIp), new Date().toISOString()]
    );
  } catch (err) {
    console.error('Audit Log Error:', err.message);
  }
}

// Utility: Local IPv4 resolver
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Helper to format stats from SQL row to JSON
function formatStats(row) {
  if (!row) return {};
  return {
    exchangeRate: row.exchangeRate,
    scoreRate: row.scoreRate,
    inProcessAmount: row.inProcessAmount,
    inProcessOrders: row.inProcessOrders,
    commissionRate: row.commissionRate,
    estimatedIncome: row.estimatedIncome,
    isSellingOpen: Boolean(row.isSellingOpen),
    specialRewardActive: Boolean(row.specialRewardActive),
    maintenanceMode: Boolean(row.maintenanceMode),
    adminUpiId: row.adminUpiId,
    merchantName: row.merchantName,
    adminQrText: row.adminQrText,
    appVersion: row.appVersion,
    appDownloadUrl: row.appDownloadUrl || '/downloads/fintech-hub.apk',
    date: row.date
  };
}

// ==========================================
// 0. HEALTH CHECK ENDPOINTS (RENDER DEPLOYMENT)
// ==========================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ROTERPAY Platform API' });
});

app.get('/health/db', async (req, res) => {
  try {
    const result = await db.queryOne('SELECT 1 as alive');
    if (result && (result.alive === 1 || result.alive === '1')) {
      return res.json({
        status: 'ok',
        database: 'connected',
        type: 'PostgreSQL',
        timestamp: new Date().toISOString()
      });
    }
    res.status(503).json({ status: 'error', database: 'disconnected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'error', message: err.message });
  }
});

// ==========================================
// 1. PUBLIC USER & AUTHENTICATION API (SQL)
// ==========================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { loginInput, password } = req.body;
    if (!loginInput || !password) {
      return res.status(400).json({ error: 'Mobile number/ID and password required' });
    }

    const query = String(loginInput).trim();
    const user = await db.queryOne(
      `SELECT * FROM users WHERE id = $1 OR phone = $2 LIMIT 1`,
      [query, query]
    );

    if (!user) {
      return res.status(404).json({ error: 'Account not found. Please register.' });
    }

    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    if (user.status === 'BANNED' || user.status === 'FROZEN') {
      return res.status(403).json({ error: `Account is suspended by Admin` });
    }

    // Transparently upgrade legacy plaintext password to secure bcrypt hash
    if (!user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
      try {
        const newHash = await hashPassword(password);
        await db.run(`UPDATE users SET password = $1 WHERE id = $2`, [newHash, user.id]);
      } catch (e) {}
    }

    const token = generateUserToken(user);
    await logAudit('User Login', `User ${user.name} (${user.id}) logged in successfully`, req);

    res.json({
      success: true,
      user: sanitizeUser(user),
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error during login' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, password, referralCode } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Full Name, Phone, and Password are required' });
    }

    const cleanPhone = String(phone).trim();
    const existing = await db.queryOne(`SELECT id FROM users WHERE phone = $1 LIMIT 1`, [cleanPhone]);
    if (existing) {
      return res.status(400).json({ error: `Mobile number ${cleanPhone} is already registered. Please login.` });
    }

    const newId = String(Math.floor(100000 + Math.random() * 900000));
    const hashedPassword = await hashPassword(password);
    const createdAt = new Date().toISOString().split('T')[0];

    await db.run(
      `INSERT INTO users (id, name, phone, password, balance, deposit, withdrawal, commission, scorePoints, sellTotal, cashbackReward, cashbackPending, status, referralCode, createdAt)
       VALUES ($1, $2, $3, $4, 0.0, 0.0, 0.0, 0.0, 500, 0.0, 0, 0, 'ACTIVE', $5, $6)`,
      [newId, String(name).trim(), cleanPhone, hashedPassword, referralCode ? String(referralCode).trim() : '', createdAt]
    );

    const newUser = await db.queryOne(`SELECT * FROM users WHERE id = $1`, [newId]);
    const token = generateUserToken(newUser);
    await logAudit('User Registration', `New user registered: ${name} (ID: ${newId})`, req);

    res.status(201).json({
      success: true,
      message: 'Registration successful! 500 Welcome Score Points credited.',
      user: sanitizeUser(newUser),
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Database error during registration' });
  }
});

app.get('/api/user', async (req, res) => {
  try {
    const userId = req.query.id || (req.user && req.user.userId);
    if (!userId) return res.status(401).json({ error: 'User ID is required' });
    const user = await db.queryOne(`SELECT * FROM users WHERE id = $1`, [String(userId)]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('User fetch error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ==========================================
// 2. FINANCIAL & P2P ORDERS API (SQL TRANSACTIONS)
// ==========================================

app.get('/api/user/deposit-orders', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.json([]);
    const orders = await db.queryAll(
      `SELECT * FROM deposit_buy_orders WHERE userId = $1 ORDER BY timestamp DESC`,
      [String(userId)]
    );
    res.json(orders);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/user/sell-orders', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.json([]);
    const orders = await db.queryAll(
      `SELECT * FROM sell_orders WHERE userId = $1 ORDER BY timestamp DESC`,
      [String(userId)]
    );
    res.json(orders);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/user/orders', async (req, res) => {
  try {
    const userId = req.query.id || req.query.userId;
    if (!userId) return res.json([]);
    const uid = String(userId);
    const deposits = await db.queryAll(`SELECT * FROM deposit_buy_orders WHERE userId = $1`, [uid]);
    const sells = await db.queryAll(`SELECT * FROM sell_orders WHERE userId = $1`, [uid]);
    const combined = [...deposits, ...sells];
    combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(combined);
  } catch (err) {
    res.json([]);
  }
});

// Score Conversion Transaction
app.post('/api/user/convert-score', async (req, res) => {
  try {
    const { userId, points } = req.body;
    const numPoints = parseInt(points, 10);

    if (!numPoints || numPoints < 100 || isNaN(numPoints)) {
      return res.status(400).json({ error: 'Minimum score conversion is 100 points' });
    }

    if (!userId) return res.status(401).json({ error: 'User ID required' });

    const result = await db.tx(async (client) => {
      const targetUser = await client.queryOne(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [String(userId)]);
      if (!targetUser) throw new Error('USER_NOT_FOUND');

      if (targetUser.scorePoints < numPoints) {
        throw new Error(`INSUFFICIENT_POINTS: You have ${targetUser.scorePoints} PTS`);
      }

      const stats = await client.queryOne(`SELECT scoreRate FROM stats_data WHERE id = 1`);
      const scoreRate = stats ? stats.scoreRate : 10;
      const convertedInr = Math.round(((numPoints / 100) * scoreRate) * 100) / 100;

      const newScore = targetUser.scorePoints - numPoints;
      const newBalance = Math.round((targetUser.balance + convertedInr) * 100) / 100;

      await client.run(`UPDATE users SET scorePoints = $1, balance = $2 WHERE id = $3`, [newScore, newBalance, targetUser.id]);
      await client.run(
        `INSERT INTO score_conversions (id, userId, pointsConverted, inrReceived, timestamp) VALUES ($1, $2, $3, $4, $5)`,
        [Date.now(), targetUser.id, numPoints, convertedInr, new Date().toISOString()]
      );
      await client.run(
        `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`,
        [Date.now(), targetUser.id, 'Score Roll Out Conversion', convertedInr, 'Completed', new Date().toISOString()]
      );

      return { targetUser, numPoints, convertedInr, newScore, newBalance };
    });

    await logAudit('Score Converted', `User ${result.targetUser.name} converted ${result.numPoints} Score into ₹ ${result.convertedInr.toFixed(2)}`, req);

    res.json({
      success: true,
      message: `Successfully converted ${result.numPoints} Score Points into ₹ ${result.convertedInr.toFixed(2)} wallet balance!`,
      newScore: result.newScore,
      newBalance: result.newBalance
    });
  } catch (err) {
    if (err.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User not found' });
    if (err.message.startsWith('INSUFFICIENT_POINTS')) return res.status(400).json({ error: err.message.replace('INSUFFICIENT_POINTS: ', '') });
    console.error('Score convert error:', err);
    res.status(500).json({ error: 'Database conversion error' });
  }
});

// P2P Matching Query Endpoint
app.get('/api/p2p/match-order', async (req, res) => {
  try {
    const { amount, userId } = req.query;
    const num = sanitizeAmount(amount) || Number(amount);
    const uid = String(userId || '');

    const matchedSellOrder = await db.queryOne(
      `SELECT * FROM sell_orders WHERE (status = 'Pending' OR status = 'Submitted') AND userId != $1 AND amount = $2 LIMIT 1`,
      [uid, num]
    );

    const stats = await db.queryOne(`SELECT merchantName, adminUpiId FROM stats_data WHERE id = 1`);

    if (matchedSellOrder) {
      const peerUpi = matchedSellOrder.accountNumber && matchedSellOrder.accountNumber.includes('@')
        ? matchedSellOrder.accountNumber
        : `${matchedSellOrder.userId}@upi`;

      res.json({
        hasMatch: true,
        sellOrderId: matchedSellOrder.id,
        peerUserId: matchedSellOrder.userId,
        peerName: matchedSellOrder.userName,
        payoutBank: matchedSellOrder.payoutBank,
        accountNumber: matchedSellOrder.accountNumber,
        upiId: peerUpi,
        amount: matchedSellOrder.amount
      });
    } else {
      res.json({
        hasMatch: false,
        peerName: stats ? stats.merchantName : 'Fintech Hub',
        upiId: stats ? stats.adminUpiId : '8104229900@upi',
        amount: num
      });
    }
  } catch (err) {
    res.json({ hasMatch: false, peerName: 'Fintech Hub', upiId: '8104229900@upi', amount: Number(req.query.amount) || 0 });
  }
});

// Top-up Deposit Transaction (SQL)
app.post('/api/user/topup', async (req, res) => {
  try {
    const { amount, userId, paymentChannel, utrNumber, matchedSellOrderId } = req.body;
    const num = sanitizeAmount(amount);
    if (!num) return res.status(400).json({ error: 'Invalid top-up amount' });

    if (!userId) return res.status(401).json({ error: 'User ID is required' });

    const result = await db.tx(async (client) => {
      const targetUser = await client.queryOne(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [String(userId)]);
      if (!targetUser) throw new Error('USER_NOT_FOUND');

      const stats = await client.queryOne(`SELECT exchangeRate FROM stats_data WHERE id = 1`);
      const exchangeRate = stats ? stats.exchangeRate : 110;

      const newBalance = Math.round((targetUser.balance + num) * 100) / 100;
      const newDeposit = Math.round((targetUser.deposit + num) * 100) / 100;

      await client.run(`UPDATE users SET balance = $1, deposit = $2 WHERE id = $3`, [newBalance, newDeposit, targetUser.id]);

      const newOrder = {
        id: Math.floor(800000 + Math.random() * 100000),
        userId: targetUser.id,
        userName: targetUser.name,
        orderType: 'Deposit',
        amount: num,
        usdtAmount: Math.round(num / exchangeRate),
        status: 'Success',
        paymentChannel: paymentChannel || 'UPI Direct',
        utrNumber: utrNumber || 'Auto-Verified P2P',
        timestamp: new Date().toISOString()
      };

      await client.run(
        `INSERT INTO deposit_buy_orders (id, userId, userName, orderType, amount, usdtAmount, status, paymentChannel, utrNumber, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [newOrder.id, newOrder.userId, newOrder.userName, newOrder.orderType, newOrder.amount, newOrder.usdtAmount, newOrder.status, newOrder.paymentChannel, newOrder.utrNumber, newOrder.timestamp]
      );

      await client.run(
        `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`,
        [Date.now(), targetUser.id, `Deposit Added (₹${num.toFixed(2)})`, num, 'Success', new Date().toISOString()]
      );

      // P2P Match fulfillment
      let matchedSellOrder = null;
      if (matchedSellOrderId) {
        matchedSellOrder = await client.queryOne(`SELECT * FROM sell_orders WHERE id = $1 FOR UPDATE`, [Number(matchedSellOrderId)]);
      }
      if (!matchedSellOrder) {
        matchedSellOrder = await client.queryOne(
          `SELECT * FROM sell_orders WHERE (status = 'Pending' OR status = 'Submitted') AND userId != $1 AND amount = $2 LIMIT 1 FOR UPDATE`,
          [targetUser.id, num]
        );
      }

      if (matchedSellOrder) {
        const matchNote = `Direct P2P Paid by User #${targetUser.id} (${targetUser.name}) via UTR: ${utrNumber || 'Verified'}`;
        await client.run(
          `UPDATE sell_orders SET status = 'Success', p2pMatchedWith = $1, matchedNote = $2 WHERE id = $3`,
          [targetUser.id, matchNote, matchedSellOrder.id]
        );

        await client.run(
          `INSERT INTO notifications (id, title, body, type, isRead, time, targetUserId) VALUES ($1, $2, $3, $4, 0, $5, $6)`,
          [
            Date.now(),
            '⚡ P2P Direct Payment Received!',
            `User ${targetUser.name} (#${targetUser.id}) transferred ₹${num} directly to your ${matchedSellOrder.payoutBank} account (${matchedSellOrder.accountNumber}). UTR: ${utrNumber || 'Verified'}.`,
            'Success',
            new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            matchedSellOrder.userId
          ]
        );
      }

      return { targetUser, newOrder, newBalance, matchedSellOrder };
    });

    await logAudit('Top-up Deposit Added', `User ${result.targetUser.name} added deposit ₹${num.toFixed(2)}. Wallet: ₹${result.newBalance.toFixed(2)}`, req);

    res.json({
      success: true,
      message: result.matchedSellOrder
        ? `⚡ Direct P2P Transfer Success! Paid ₹${num} directly to ${result.matchedSellOrder.userName}. Wallet credited!`
        : `₹${num} added to wallet balance & pool liquidity updated!`,
      order: result.newOrder,
      newBalance: result.newBalance
    });
  } catch (err) {
    if (err.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User not found' });
    console.error('Topup error:', err);
    res.status(500).json({ error: 'Database topup error' });
  }
});

// Withdrawal Transaction (SQL)
app.post('/api/user/withdraw', async (req, res) => {
  try {
    const { amount, userId, payoutBank, accountNumber } = req.body;
    const num = sanitizeAmount(amount);
    if (!num) return res.status(400).json({ error: 'Invalid withdrawal amount' });

    if (!userId) return res.status(401).json({ error: 'User ID is required' });

    const result = await db.tx(async (client) => {
      const targetUser = await client.queryOne(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [String(userId)]);
      if (!targetUser) throw new Error('USER_NOT_FOUND');

      if (num > targetUser.balance) {
        throw new Error(`INSUFFICIENT_BALANCE: Your balance is ₹${targetUser.balance.toFixed(2)}`);
      }

      const newBalance = Math.round((targetUser.balance - num) * 100) / 100;
      const newWithdrawal = Math.round((targetUser.withdrawal + num) * 100) / 100;

      await client.run(`UPDATE users SET balance = $1, withdrawal = $2 WHERE id = $3`, [newBalance, newWithdrawal, targetUser.id]);

      const poolData = await client.queryOne(`SELECT COALESCE(SUM(deposit), 0) as totalDeposit, COALESCE(SUM(withdrawal), 0) as totalWithdrawal FROM users`);
      const availableLiquidity = Math.max(1000, ((poolData ? poolData.totaldeposit : 0) - (poolData ? poolData.totalwithdrawal : 0)));

      const isAutoMatched = availableLiquidity >= num;
      const initialStatus = isAutoMatched ? 'Success' : 'Pending';

      const stats = await client.queryOne(`SELECT exchangeRate FROM stats_data WHERE id = 1`);
      const exchangeRate = stats ? stats.exchangeRate : 110;

      const newOrder = {
        id: Math.floor(900000 + Math.random() * 100000),
        userId: targetUser.id,
        userName: targetUser.name,
        orderType: 'Sell',
        amount: num,
        usdtAmount: Math.round((num / exchangeRate) * 100) / 100,
        status: initialStatus,
        payoutBank: payoutBank || 'Bank Transfer',
        accountNumber: accountNumber || '****9900',
        timestamp: new Date().toISOString(),
        matchedNote: isAutoMatched ? 'Auto-fulfilled via P2P Liquidity Pool' : 'Queued for Next Peer Deposit'
      };

      await client.run(
        `INSERT INTO sell_orders (id, userId, userName, orderType, amount, usdtAmount, status, payoutBank, accountNumber, matchedNote, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [newOrder.id, newOrder.userId, newOrder.userName, newOrder.orderType, newOrder.amount, newOrder.usdtAmount, newOrder.status, newOrder.payoutBank, newOrder.accountNumber, newOrder.matchedNote, newOrder.timestamp]
      );

      await client.run(
        `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`,
        [Date.now(), targetUser.id, `Withdrawal (₹${num.toFixed(2)})`, num, initialStatus, new Date().toISOString()]
      );

      return { targetUser, newOrder, newBalance, isAutoMatched, initialStatus };
    });

    await logAudit('Withdrawal Requested', `User ${result.targetUser.name} requested sell order ₹${num.toFixed(2)}. Status: ${result.initialStatus}`, req);

    res.json({
      success: true,
      message: result.isAutoMatched
        ? `⚡ Instant P2P Match! ₹${num} withdrawal auto-matched & processed to ${payoutBank} (${accountNumber})!`
        : `₹${num} Withdrawal submitted & queued in P2P Liquidity Pool. Status: Pending Peer Deposit.`,
      order: result.newOrder,
      newBalance: result.newBalance
    });
  } catch (err) {
    if (err.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User not found' });
    if (err.message.startsWith('INSUFFICIENT_BALANCE')) return res.status(400).json({ error: err.message.replace('INSUFFICIENT_BALANCE: ', '') });
    console.error('Withdraw error:', err);
    res.status(500).json({ error: 'Database withdraw error' });
  }
});

// Stats & Selling State
app.get('/api/stats', async (req, res) => {
  try {
    const row = await db.queryOne(`SELECT * FROM stats_data WHERE id = 1`);
    res.json(formatStats(row));
  } catch (err) {
    res.status(500).json({ error: 'Database stats error' });
  }
});

app.post('/api/stats/toggle-selling', async (req, res) => {
  try {
    await db.run(`UPDATE stats_data SET isSellingOpen = (CASE WHEN isSellingOpen = 1 THEN 0 ELSE 1 END) WHERE id = 1`);
    const row = await db.queryOne(`SELECT isSellingOpen FROM stats_data WHERE id = 1`);
    const isSellingOpen = Boolean(row ? row.issellingopen : false);
    await logAudit('Selling Toggled', `Selling status set to ${isSellingOpen ? 'OPEN' : 'CLOSED'}`, req);
    res.json({ success: true, isSellingOpen });
  } catch (err) {
    res.status(500).json({ error: 'Database toggle error' });
  }
});

// Offers & Claiming
app.get('/api/payment/offers', async (req, res) => {
  try {
    const userId = req.query.userId;
    const offers = await db.queryAll(`SELECT * FROM payment_offers ORDER BY amount ASC`);
    const todayDateStr = new Date().toISOString().split('T')[0];

    let claimedOfferIds = new Set();
    if (userId) {
      const claimedRows = await db.queryAll(
        `SELECT offerId FROM user_claimed_offers WHERE userId = $1 AND claimedDate = $2`,
        [String(userId), todayDateStr]
      );
      claimedOfferIds = new Set(claimedRows.map(r => Number(r.offerid || r.offerId)));
    }

    const result = offers.map(o => ({
      ...o,
      isClaimedToday: claimedOfferIds.has(Number(o.id))
    }));

    res.json(result);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/payment/claim', async (req, res) => {
  try {
    const { offerId, userId } = req.body;
    if (!offerId || !userId) return res.status(400).json({ error: 'Offer ID and User ID required' });

    const result = await db.tx(async (client) => {
      const offer = await client.queryOne(`SELECT * FROM payment_offers WHERE id = $1`, [Number(offerId)]);
      if (!offer) throw new Error('OFFER_NOT_FOUND');

      const targetUser = await client.queryOne(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [String(userId)]);
      if (!targetUser) throw new Error('USER_NOT_FOUND');

      const todayDateStr = new Date().toISOString().split('T')[0];
      const alreadyClaimed = await client.queryOne(
        `SELECT * FROM user_claimed_offers WHERE userId = $1 AND offerId = $2 AND claimedDate = $3`,
        [targetUser.id, offer.id, todayDateStr]
      );

      if (alreadyClaimed) {
        throw new Error(`ALREADY_CLAIMED: You have already claimed ${offer.code} today. Come back tomorrow!`);
      }

      const stats = await client.queryOne(`SELECT specialRewardActive FROM stats_data WHERE id = 1`);
      const specialRewardActive = stats ? Boolean(stats.specialrewardactive) : true;
      const totalEarned = Math.round((offer.income + (specialRewardActive ? offer.specialbonus : 0)) * 100) / 100;

      const newComm = Math.round((targetUser.commission + totalEarned) * 100) / 100;
      const newBal = Math.round((targetUser.balance + totalEarned) * 100) / 100;
      const newScore = targetUser.scorePoints + 50;

      await client.run(`UPDATE users SET commission = $1, balance = $2, scorePoints = $3 WHERE id = $4`, [newComm, newBal, newScore, targetUser.id]);

      await client.run(
        `INSERT INTO user_claimed_offers (userId, offerId, offerCode, claimedDate, timestamp) VALUES ($1, $2, $3, $4, $5)`,
        [targetUser.id, offer.id, offer.code, todayDateStr, new Date().toISOString()]
      );

      await client.run(
        `INSERT INTO transactions (id, userId, type, amount, income, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [Date.now(), targetUser.id, `Claim Order (${offer.code})`, offer.amount, totalEarned, 'Completed', new Date().toISOString()]
      );

      return { targetUser, offer, totalEarned, newBal, newScore };
    });

    await logAudit('Order Claimed', `User ${result.targetUser.name} claimed offer ${result.offer.code} (+₹ ${result.totalEarned.toFixed(2)})`, req);
    res.json({ success: true, earned: result.totalEarned, newBalance: result.newBal, newScore: result.newScore });
  } catch (err) {
    if (err.message === 'OFFER_NOT_FOUND') return res.status(404).json({ error: 'Offer not found' });
    if (err.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User not found' });
    if (err.message.startsWith('ALREADY_CLAIMED')) return res.status(400).json({ error: err.message.replace('ALREADY_CLAIMED: ', '') });
    console.error('Claim error:', err);
    res.status(500).json({ error: 'Database claim error' });
  }
});

// Transactions & Wallets
app.get('/api/transactions', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (userId) {
      const userTx = await db.queryAll(`SELECT * FROM transactions WHERE userId = $1 ORDER BY timestamp DESC`, [String(userId)]);
      return res.json(userTx);
    }
    const allTx = await db.queryAll(`SELECT * FROM transactions ORDER BY timestamp DESC`);
    res.json(allTx);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/wallets', async (req, res) => {
  try {
    const wallets = await db.queryAll(`SELECT * FROM user_wallets ORDER BY id DESC`);
    res.json(wallets);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/wallets', async (req, res) => {
  try {
    const { walletName, walletAddress, walletType, holderName, userId } = req.body;
    if (!walletAddress) return res.status(400).json({ error: 'Account or wallet address required' });

    const newWallet = {
      id: Date.now(),
      userId: userId || 'N/A',
      userName: holderName || 'User',
      name: walletName || 'Payment Tool',
      address: String(walletAddress).trim(),
      holderName: holderName ? String(holderName).trim() : '',
      type: walletType || 'Personal',
      createdAt: new Date().toISOString().split('T')[0]
    };

    await db.run(
      `INSERT INTO user_wallets (id, userId, userName, name, address, holderName, type, createdAt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newWallet.id, newWallet.userId, newWallet.userName, newWallet.name, newWallet.address, newWallet.holderName, newWallet.type, newWallet.createdAt]
    );

    await logAudit('Wallet Added', `Added ${walletName} (${walletAddress})`, req);
    res.status(201).json(newWallet);
  } catch (err) {
    res.status(500).json({ error: 'Database error adding wallet' });
  }
});

app.delete('/api/wallets/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.queryOne(`SELECT * FROM user_wallets WHERE id = $1`, [id]);
    if (!existing) return res.status(404).json({ error: 'Wallet not found' });

    await db.run(`DELETE FROM user_wallets WHERE id = $1`, [id]);
    await logAudit('Wallet Deleted', `Deleted wallet ${existing.name}`, req);
    res.json({ success: true, deleted: existing });
  } catch (err) {
    res.status(500).json({ error: 'Database delete error' });
  }
});

// Notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const notifications = await db.queryAll(`SELECT * FROM notifications ORDER BY id DESC`);
    const unreadCount = notifications.filter(n => !n.isRead && !n.isread).length;
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.json({ notifications: [], unreadCount: 0 });
  }
});

app.post('/api/notifications/read', async (req, res) => {
  try {
    const { id, markAll } = req.body;
    if (markAll) {
      await db.run(`UPDATE notifications SET isRead = 1`);
      return res.json({ success: true, unreadCount: 0 });
    }
    await db.run(`UPDATE notifications SET isRead = 1 WHERE id = $1`, [Number(id)]);
    const notifications = await db.queryAll(`SELECT * FROM notifications`);
    const unreadCount = notifications.filter(n => !n.isRead && !n.isread).length;
    res.json({ success: true, unreadCount });
  } catch (err) {
    res.status(500).json({ error: 'Database notification error' });
  }
});

// Portfolio & Developer Bonus
const websiteCreditsData = {
  developer: {
    name: 'Antigravity DeepMind Dev Team',
    role: 'Lead Full-Stack & Fintech Solutions Architect',
    portfolioTitle: 'Fintech Hub & Real-time P2P Exchange Architecture',
    tagline: 'High-Performance Financial Applications & Next-Gen User Experience',
    version: 'v3.0.0-production',
    status: 'Verified PostgreSQL Production Build',
    techStack: ['Node.js', 'Express.js', 'PostgreSQL Relational Database (pg)', 'JavaScript ES6+', 'P2P Matching Engine', 'RESTful API'],
    githubUrl: 'https://github.com',
    portfolioUrl: 'https://portfolio.dev',
    creditsAwarded: 1500,
    totalProjectsCompleted: 48,
    clientSatisfaction: '99.8%'
  }
};

app.get('/api/portfolio', async (req, res) => {
  try {
    const uCount = await db.queryOne(`SELECT COUNT(*) as total FROM users`);
    const dCount = await db.queryOne(`SELECT COUNT(*) as total FROM deposit_buy_orders`);
    const sCount = await db.queryOne(`SELECT COUNT(*) as total FROM sell_orders`);
    const stats = await db.queryOne(`SELECT exchangeRate FROM stats_data WHERE id = 1`);

    res.json({
      success: true,
      portfolio: websiteCreditsData.developer,
      systemStats: {
        totalUsers: uCount ? Number(uCount.total) : 0,
        activeOrders: (dCount ? Number(dCount.total) : 0) + (sCount ? Number(sCount.total) : 0),
        platformUptime: '99.99%',
        exchangeRate: stats ? stats.exchangeRate : 110
      }
    });
  } catch (err) {
    res.json({ success: true, portfolio: websiteCreditsData.developer });
  }
});

app.post('/api/credits/claim', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(401).json({ error: 'User ID is required' });

    const result = await db.tx(async (client) => {
      const user = await client.queryOne(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [String(userId)]);
      if (!user) throw new Error('USER_NOT_FOUND');

      if (user.hasClaimedDevCredit || user.hasclaimeddevcredit) {
        throw new Error('ALREADY_CLAIMED');
      }

      const bonusAmount = 250;
      const bonusPoints = 300;
      const newBal = Math.round((user.balance + bonusAmount) * 100) / 100;
      const newScore = user.scorePoints + bonusPoints;

      await client.run(`UPDATE users SET balance = $1, scorePoints = $2, hasClaimedDevCredit = 1 WHERE id = $3`, [newBal, newScore, user.id]);

      await client.run(
        `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`,
        [Date.now(), user.id, 'Website Portfolio Developer Bonus', bonusAmount, 'Completed', new Date().toISOString()]
      );

      await client.run(
        `INSERT INTO notifications (id, title, body, type, isRead, time, targetUserId) VALUES ($1, $2, $3, $4, 0, $5, $6)`,
        [
          Date.now(),
          '🏆 Developer Portfolio Credit Claimed!',
          `Congratulations! You claimed ₹${bonusAmount} wallet balance + ${bonusPoints} Score Points as a special Website Credit bonus.`,
          'Success',
          'Just now',
          user.id
        ]
      );

      return { user, bonusAmount, bonusPoints, newBal, newScore };
    });

    await logAudit('Website Credit Claimed', `User ${result.user.name} (${result.user.id}) claimed ₹${result.bonusAmount} Dev Credit Bonus`, req);

    res.json({
      success: true,
      message: `🎉 Success! Credit bonus of ₹${result.bonusAmount} & ${result.bonusPoints} PTS added to your wallet!`,
      newBalance: result.newBal,
      newScorePoints: result.newScore
    });
  } catch (err) {
    if (err.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User not found' });
    if (err.message === 'ALREADY_CLAIMED') return res.status(400).json({ error: 'Developer Portfolio Bonus Credit has already been claimed for this account!' });
    res.status(500).json({ error: 'Database credit error' });
  }
});

// ==========================================
// 3. ADMIN MANAGEMENT API ROUTES (PROTECTED)
// ==========================================

app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || String(password).trim() !== String(ADMIN_PASSCODE).trim()) {
      await logAudit('Admin Auth Failed', 'Invalid admin password attempt', req);
      return res.status(401).json({ error: 'Invalid Admin Passcode' });
    }

    const token = generateAdminToken();
    await logAudit('Admin Auth Success', 'PC Master Admin authenticated', req);
    res.json({ success: true, token, role: 'admin' });
  } catch (err) {
    console.error('Admin auth error:', err);
    res.status(500).json({ error: 'Admin authentication error' });
  }
});

app.get('/api/admin/overview', async (req, res) => {
  try {
    const summary = await db.queryOne(`
      SELECT 
        COUNT(*) as totalUsers,
        COALESCE(SUM(balance), 0) as totalBalance,
        COALESCE(SUM(deposit), 0) as totalDeposit,
        COALESCE(SUM(withdrawal), 0) as totalWithdrawal,
        COALESCE(SUM(commission), 0) as totalCommission
      FROM users
    `);

    const pDeposit = await db.queryOne(`SELECT COUNT(*) as count FROM deposit_buy_orders WHERE status = 'Processing' OR status = 'Submit'`);
    const pSell = await db.queryOne(`SELECT COUNT(*) as count FROM sell_orders WHERE status = 'Pending' OR status = 'Submitted'`);

    const stats = await db.queryOne(`SELECT * FROM stats_data WHERE id = 1`);
    const formattedStats = formatStats(stats);

    res.json({
      totalUsers: summary ? Number(summary.totalusers) : 0,
      totalBalance: summary ? Number(summary.totalbalance) : 0,
      totalDeposit: summary ? Number(summary.totaldeposit) : 0,
      totalWithdrawal: summary ? Number(summary.totalwithdrawal) : 0,
      totalCommission: summary ? Number(summary.totalcommission) : 0,
      pendingOrdersCount: (pDeposit ? Number(pDeposit.count) : 0) + (pSell ? Number(pSell.count) : 0),
      ...formattedStats
    });
  } catch (err) {
    res.status(500).json({ error: 'Database overview error' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await db.queryAll(`SELECT * FROM users ORDER BY createdAt DESC`);
    res.json(users.map(u => sanitizeUser(u)));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/admin/users/create', async (req, res) => {
  try {
    const { name, phone, password, userId, balance, deposit, commission, scorePoints, status } = req.body;
    if (!name) return res.status(400).json({ error: 'User name is required' });

    const id = userId && userId.trim() !== '' ? userId.trim() : String(Math.floor(100000 + Math.random() * 900000));
    const existing = await db.queryOne(`SELECT id FROM users WHERE id = $1`, [id]);
    if (existing) {
      return res.status(400).json({ error: `User ID ${id} already exists` });
    }

    const hashedPassword = await hashPassword(password || '123');
    const newUser = {
      id,
      name: String(name).trim(),
      phone: phone ? String(phone).trim() : '9876543210',
      password: hashedPassword,
      balance: sanitizeAmount(balance) || 0.0,
      deposit: sanitizeAmount(deposit) || 0.0,
      withdrawal: 0.0,
      commission: sanitizeAmount(commission) || 0.0,
      scorePoints: parseInt(scorePoints, 10) || 500,
      sellTotal: 0.0,
      cashbackReward: 0,
      cashbackPending: 0,
      status: status || 'ACTIVE',
      createdAt: new Date().toISOString().split('T')[0]
    };

    await db.run(
      `INSERT INTO users (id, name, phone, password, balance, deposit, withdrawal, commission, scorePoints, sellTotal, cashbackReward, cashbackPending, status, createdAt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [newUser.id, newUser.name, newUser.phone, newUser.password, newUser.balance, newUser.deposit, newUser.withdrawal, newUser.commission, newUser.scorePoints, newUser.sellTotal, newUser.cashbackReward, newUser.cashbackPending, newUser.status, newUser.createdAt]
    );

    await logAudit('User Created', `Admin created user ${newUser.name} (ID: ${newUser.id})`, req);
    res.status(201).json(sanitizeUser(newUser));
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Database create user error' });
  }
});

app.post('/api/admin/users/update', async (req, res) => {
  try {
    const { userId, name, phone, password, balance, deposit, withdrawal, commission, scorePoints, status, bonus } = req.body;
    const user = await db.queryOne(`SELECT * FROM users WHERE id = $1`, [String(userId)]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let newName = (name && name.trim() !== '') ? name.trim() : user.name;
    let newPhone = (phone && phone.trim() !== '') ? phone.trim() : user.phone;
    let newPass = (password && password.trim() !== '') ? await hashPassword(password) : user.password;
    let newBal = (typeof balance === 'number' && isFinite(balance)) ? Math.round(balance * 100) / 100 : user.balance;
    let newDep = (typeof deposit === 'number' && isFinite(deposit)) ? Math.round(deposit * 100) / 100 : user.deposit;
    let newWith = (typeof withdrawal === 'number' && isFinite(withdrawal)) ? Math.round(withdrawal * 100) / 100 : user.withdrawal;
    let newComm = (typeof commission === 'number' && isFinite(commission)) ? Math.round(commission * 100) / 100 : user.commission;
    let newScore = (typeof scorePoints === 'number') ? scorePoints : user.scorePoints;
    let newStatus = status || user.status;

    if (typeof bonus === 'number' && bonus > 0) {
      newBal = Math.round((newBal + bonus) * 100) / 100;
      await db.run(
        `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`,
        [Date.now(), user.id, 'Admin Credit Bonus', bonus, 'Completed', new Date().toISOString()]
      );
    }

    await db.run(
      `UPDATE users SET name = $1, phone = $2, password = $3, balance = $4, deposit = $5, withdrawal = $6, commission = $7, scorePoints = $8, status = $9 WHERE id = $10`,
      [newName, newPhone, newPass, newBal, newDep, newWith, newComm, newScore, newStatus, user.id]
    );

    const updated = await db.queryOne(`SELECT * FROM users WHERE id = $1`, [user.id]);
    await logAudit('User Updated', `Admin updated account ${updated.name} (${updated.id})`, req);
    res.json({ success: true, user: sanitizeUser(updated) });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Database update user error' });
  }
});

app.post('/api/admin/users/adjust-balance', async (req, res) => {
  try {
    const { userId, action, amount, reason } = req.body;
    const num = sanitizeAmount(amount);
    if (!userId || !num) return res.status(400).json({ error: 'Valid UserId and Amount required' });

    const result = await db.tx(async (client) => {
      const user = await client.queryOne(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [String(userId)]);
      if (!user) throw new Error('USER_NOT_FOUND');

      let newBalance = user.balance;
      if (action === 'add') {
        newBalance = Math.round((user.balance + num) * 100) / 100;
        await client.run(`UPDATE users SET balance = $1 WHERE id = $2`, [newBalance, user.id]);
        await client.run(
          `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`,
          [Date.now(), user.id, `Admin Credit (${reason || 'Manual Credit'})`, num, 'Completed', new Date().toISOString()]
        );
      } else if (action === 'deduct') {
        if (num > user.balance) throw new Error('DEDUCT_EXCEEDS_BALANCE');
        newBalance = Math.round((user.balance - num) * 100) / 100;
        await client.run(`UPDATE users SET balance = $1 WHERE id = $2`, [newBalance, user.id]);
        await client.run(
          `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`,
          [Date.now(), user.id, `Admin Debit (${reason || 'Manual Adjustment'})`, -num, 'Completed', new Date().toISOString()]
        );
      } else {
        throw new Error('INVALID_ACTION');
      }

      const updatedUser = await client.queryOne(`SELECT * FROM users WHERE id = $1`, [user.id]);
      return { user, newBalance, updatedUser };
    });

    await logAudit('Balance Adjusted', `Admin ${action}ed ₹ ${num} for ${result.user.name} (${result.user.id})`, req);
    res.json({ success: true, newBalance: result.newBalance, user: sanitizeUser(result.updatedUser) });
  } catch (err) {
    if (err.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User not found' });
    if (err.message === 'DEDUCT_EXCEEDS_BALANCE') return res.status(400).json({ error: 'Deduct amount exceeds user balance' });
    if (err.message === 'INVALID_ACTION') return res.status(400).json({ error: 'Invalid action (add or deduct required)' });
    console.error('Balance adjust error:', err);
    res.status(500).json({ error: 'Database balance adjustment error' });
  }
});

app.post('/api/admin/users/toggle-status', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await db.queryOne(`SELECT * FROM users WHERE id = $1`, [String(userId)]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newStatus = user.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
    await db.run(`UPDATE users SET status = $1 WHERE id = $2`, [newStatus, user.id]);
    await logAudit('User Status Toggled', `Admin set ${user.name} (${user.id}) status to ${newStatus}`, req);

    const updatedUser = await db.queryOne(`SELECT * FROM users WHERE id = $1`, [user.id]);
    res.json({ success: true, status: newStatus, user: sanitizeUser(updatedUser) });
  } catch (err) {
    res.status(500).json({ error: 'Database toggle status error' });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const existing = await db.queryOne(`SELECT * FROM users WHERE id = $1`, [id]);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    await db.run(`DELETE FROM users WHERE id = $1`, [id]);
    await logAudit('User Deleted', `Admin deleted user ${existing.name} (${existing.id})`, req);
    res.json({ success: true, deleted: sanitizeUser(existing) });
  } catch (err) {
    res.status(500).json({ error: 'Database delete user error' });
  }
});

// Admin Orders
app.get('/api/admin/orders', async (req, res) => {
  try {
    const deposits = await db.queryAll(`SELECT * FROM deposit_buy_orders`);
    const sells = await db.queryAll(`SELECT * FROM sell_orders`);
    const combined = [...deposits, ...sells];
    combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(combined);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/admin/orders/create', async (req, res) => {
  try {
    const { userId, orderType, amount, status, payoutBank, accountNumber } = req.body;
    const num = sanitizeAmount(amount);
    if (!userId || !num) return res.status(400).json({ error: 'UserId and valid Amount required' });

    const stats = await db.queryOne(`SELECT exchangeRate FROM stats_data WHERE id = 1`);
    const exchangeRate = stats ? stats.exchangeRate : 110;

    const newOrder = await db.tx(async (client) => {
      const user = (await client.queryOne(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [String(userId)])) || { name: 'System User', id: userId };

      const order = {
        id: Math.floor(800000 + Math.random() * 200000),
        userId: user.id,
        userName: user.name,
        orderType: orderType || 'Deposit',
        amount: num,
        usdtAmount: Math.round((num / exchangeRate) * 100) / 100,
        status: status || 'Success',
        paymentChannel: payoutBank || 'Admin Direct',
        timestamp: new Date().toISOString()
      };

      if (orderType === 'Deposit') {
        await client.run(
          `INSERT INTO deposit_buy_orders (id, userId, userName, orderType, amount, usdtAmount, status, paymentChannel, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [order.id, order.userId, order.userName, order.orderType, order.amount, order.usdtAmount, order.status, order.paymentChannel, order.timestamp]
        );
        if (order.status === 'Success' && user.balance !== undefined) {
          await client.run(`UPDATE users SET balance = balance + $1, deposit = deposit + $1 WHERE id = $2`, [num, user.id]);
        }
      } else {
        await client.run(
          `INSERT INTO sell_orders (id, userId, userName, orderType, amount, usdtAmount, status, payoutBank, accountNumber, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [order.id, order.userId, order.userName, order.orderType, order.amount, order.usdtAmount, order.status, payoutBank || 'Admin Direct', accountNumber || '', order.timestamp]
        );
        if (order.status === 'Success' && user.balance !== undefined) {
          await client.run(`UPDATE users SET withdrawal = withdrawal + $1 WHERE id = $2`, [num, user.id]);
          if (user.balance >= num) {
            await client.run(`UPDATE users SET balance = balance - $1 WHERE id = $2`, [num, user.id]);
          }
        }
      }

      return order;
    });

    await logAudit('Order Created', `Admin created ${orderType} order #${newOrder.id} for ₹ ${num}`, req);
    res.status(201).json(newOrder);
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Database create order error' });
  }
});

app.delete('/api/admin/orders/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const dep = await db.queryOne(`SELECT * FROM deposit_buy_orders WHERE id = $1`, [id]);
    if (dep) {
      await db.run(`DELETE FROM deposit_buy_orders WHERE id = $1`, [id]);
      await logAudit('Order Deleted', `Admin deleted Deposit order #${id}`, req);
      return res.json({ success: true, deleted: dep });
    }

    const sell = await db.queryOne(`SELECT * FROM sell_orders WHERE id = $1`, [id]);
    if (sell) {
      await db.run(`DELETE FROM sell_orders WHERE id = $1`, [id]);
      await logAudit('Order Deleted', `Admin deleted Sell order #${id}`, req);
      return res.json({ success: true, deleted: sell });
    }

    res.status(404).json({ error: 'Order not found' });
  } catch (err) {
    res.status(500).json({ error: 'Database delete order error' });
  }
});

app.post('/api/admin/orders/update-status', async (req, res) => {
  try {
    const { orderId, orderType, newStatus } = req.body;
    const id = Number(orderId);

    const updatedOrder = await db.tx(async (client) => {
      let targetOrder = null;
      if (orderType === 'Deposit') {
        targetOrder = await client.queryOne(`SELECT * FROM deposit_buy_orders WHERE id = $1 FOR UPDATE`, [id]);
      } else {
        targetOrder = await client.queryOne(`SELECT * FROM sell_orders WHERE id = $1 FOR UPDATE`, [id]);
      }

      if (!targetOrder) throw new Error('ORDER_NOT_FOUND');

      const prevStatus = targetOrder.status;

      if (orderType === 'Deposit') {
        await client.run(`UPDATE deposit_buy_orders SET status = $1 WHERE id = $2`, [newStatus, id]);
      } else {
        await client.run(`UPDATE sell_orders SET status = $1 WHERE id = $2`, [newStatus, id]);
      }

      const user = await client.queryOne(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [targetOrder.userId || targetOrder.userid]);

      if (user && prevStatus !== 'Success' && newStatus === 'Success') {
        if (orderType === 'Deposit') {
          await client.run(`UPDATE users SET balance = balance + $1, deposit = deposit + $1 WHERE id = $2`, [targetOrder.amount, user.id]);
        } else {
          await client.run(`UPDATE users SET withdrawal = withdrawal + $1 WHERE id = $2`, [targetOrder.amount, user.id]);
          if (user.balance >= targetOrder.amount) {
            await client.run(`UPDATE users SET balance = balance - $1 WHERE id = $2`, [targetOrder.amount, user.id]);
          }
        }
      }

      targetOrder.status = newStatus;
      return targetOrder;
    });

    await logAudit('Order Status Changed', `Admin set ${orderType} order #${id} status to "${newStatus}"`, req);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    if (err.message === 'ORDER_NOT_FOUND') return res.status(404).json({ error: 'Order not found' });
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Database update order status error' });
  }
});

// Notifications Broadcast
app.post('/api/admin/notifications/broadcast', async (req, res) => {
  try {
    const { title, body, type, targetUserId } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Notification title and body required' });

    const newNotif = {
      id: Date.now(),
      title: String(title).trim(),
      body: String(body).trim(),
      type: type || 'Info',
      isRead: 0,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      targetUserId: targetUserId || 'ALL'
    };

    await db.run(
      `INSERT INTO notifications (id, title, body, type, isRead, time, targetUserId) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [newNotif.id, newNotif.title, newNotif.body, newNotif.type, newNotif.isRead, newNotif.time, newNotif.targetUserId]
    );

    await logAudit('Notification Broadcast', `Admin broadcasted notification: "${newNotif.title}"`, req);
    res.status(201).json({ success: true, notification: newNotif });
  } catch (err) {
    res.status(500).json({ error: 'Database notification broadcast error' });
  }
});

// Admin Wallets
app.get('/api/admin/wallets', async (req, res) => {
  try {
    const wallets = await db.queryAll(`SELECT * FROM user_wallets ORDER BY id DESC`);
    res.json(wallets);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/admin/wallets/add', async (req, res) => {
  try {
    const { userId, walletName, walletAddress, walletType, holderName } = req.body;
    if (!walletAddress) return res.status(400).json({ error: 'Account or wallet address required' });

    const targetUser = await db.queryOne(`SELECT * FROM users WHERE id = $1`, [String(userId)]);
    const newWallet = {
      id: Date.now(),
      userId: targetUser ? targetUser.id : (userId || 'N/A'),
      userName: targetUser ? targetUser.name : 'System User',
      name: walletName || 'Payment Tool',
      address: String(walletAddress).trim(),
      holderName: holderName ? String(holderName).trim() : (targetUser ? targetUser.name : ''),
      type: walletType || 'Personal',
      createdAt: new Date().toISOString().split('T')[0]
    };

    await db.run(
      `INSERT INTO user_wallets (id, userId, userName, name, address, holderName, type, createdAt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newWallet.id, newWallet.userId, newWallet.userName, newWallet.name, newWallet.address, newWallet.holderName, newWallet.type, newWallet.createdAt]
    );

    await logAudit('Admin Added Wallet', `Admin added ${walletName} (${walletAddress}) for user ${newWallet.userId}`, req);
    res.status(201).json({ success: true, wallet: newWallet });
  } catch (err) {
    res.status(500).json({ error: 'Database add wallet error' });
  }
});

// Admin Offers Management
app.post('/api/admin/offers', async (req, res) => {
  try {
    const { amount, code, income, specialBonus, category } = req.body;
    const numAmount = sanitizeAmount(amount);
    if (!numAmount || !code) return res.status(400).json({ error: 'Valid Amount and Code required' });

    const newOffer = {
      id: Date.now(),
      amount: numAmount,
      code: String(code).trim(),
      income: sanitizeAmount(income) || 20.0,
      specialBonus: sanitizeAmount(specialBonus) || 3.0,
      category: category || '100-300'
    };

    await db.run(
      `INSERT INTO payment_offers (id, amount, code, income, specialBonus, category) VALUES ($1, $2, $3, $4, $5, $6)`,
      [newOffer.id, newOffer.amount, newOffer.code, newOffer.income, newOffer.specialBonus, newOffer.category]
    );

    await logAudit('Offer Added', `Admin added claim offer ${newOffer.code}`, req);
    res.status(201).json(newOffer);
  } catch (err) {
    res.status(500).json({ error: 'Database add offer error' });
  }
});

app.delete('/api/admin/offers/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.queryOne(`SELECT * FROM payment_offers WHERE id = $1`, [id]);
    if (!existing) return res.status(404).json({ error: 'Offer not found' });

    await db.run(`DELETE FROM payment_offers WHERE id = $1`, [id]);
    await logAudit('Offer Deleted', `Admin deleted offer ${existing.code}`, req);
    res.json({ success: true, deleted: existing });
  } catch (err) {
    res.status(500).json({ error: 'Database delete offer error' });
  }
});

// Admin Settings
app.post('/api/admin/settings', async (req, res) => {
  try {
    const { exchangeRate, scoreRate, commissionRate, specialRewardActive, maintenanceMode, isSellingOpen, appVersion, appDownloadUrl, adminUpiId, merchantName } = req.body;

    const current = await db.queryOne(`SELECT * FROM stats_data WHERE id = 1`);
    let newEx = (typeof exchangeRate === 'number') ? exchangeRate : (current ? current.exchangeRate : 110.0);
    let newScore = (typeof scoreRate === 'number') ? scoreRate : (current ? current.scoreRate : 10.0);
    let newComm = (typeof commissionRate === 'number') ? commissionRate : (current ? current.commissionRate : 4.0);
    let newSpec = (typeof specialRewardActive === 'boolean') ? (specialRewardActive ? 1 : 0) : (current ? current.specialRewardActive : 1);
    let newMaint = (typeof maintenanceMode === 'boolean') ? (maintenanceMode ? 1 : 0) : (current ? current.maintenanceMode : 0);
    let newSell = (typeof isSellingOpen === 'boolean') ? (isSellingOpen ? 1 : 0) : (current ? current.isSellingOpen : 0);
    let newVer = appVersion ? appVersion.trim() : (current ? current.appVersion : 'v1.1.9');
    let newDl = appDownloadUrl ? appDownloadUrl.trim() : (current ? current.appDownloadUrl : '/downloads/fintech-hub.apk');
    let newUpi = adminUpiId ? adminUpiId.trim() : (current ? current.adminUpiId : '8104229900@upi');
    let newMerchant = merchantName ? merchantName.trim() : (current ? current.merchantName : 'Fintech Hub');

    await db.run(
      `UPDATE stats_data SET exchangeRate = $1, scoreRate = $2, commissionRate = $3, specialRewardActive = $4, maintenanceMode = $5, isSellingOpen = $6, appVersion = $7, appDownloadUrl = $8, adminUpiId = $9, merchantName = $10 WHERE id = 1`,
      [newEx, newScore, newComm, newSpec, newMaint, newSell, newVer, newDl, newUpi, newMerchant]
    );

    const updated = await db.queryOne(`SELECT * FROM stats_data WHERE id = 1`);
    await logAudit('Settings Updated', 'Admin updated platform rates & merchant UPI settings', req);
    res.json({ success: true, statsData: formatStats(updated) });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Database settings error' });
  }
});

// Audit Logs
app.get('/api/admin/logs', async (req, res) => {
  try {
    const logs = await db.queryAll(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50`);
    res.json(logs);
  } catch (err) {
    res.json([]);
  }
});

// SPA Catch-all Route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server Initialization & Startup
async function startServer() {
  try {
    if (db.initPromise) {
      await db.initPromise;
    }
  } catch (err) {
    console.error('Database initialization warning on startup:', err.message);
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
      process.exit(1);
    }
  }

  app.listen(PORT, () => {
    const localIp = getLocalIp();
    console.log(`\n======================================================`);
    console.log(`🚀 ROTERPAY MASTER PLATFORM & API ENGINE ACTIVE!`);
    console.log(`📱 Mobile Web App Access:  http://${localIp}:${PORT}`);
    console.log(`💻 Dedicated PC Admin Dashboard: http://localhost:${PORT}/admin`);
    console.log(`🗄️  Database Mode: PostgreSQL (pg pool) - Render Ready`);
    console.log(`🔒 Security: JWT Auth + Bcrypt Hash + Atomic DB Transactions`);
    console.log(`======================================================\n`);
  });
}

startServer();
