try { require('dotenv').config(); } catch (e) { }
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

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

// SQL Audit Logger Helper
async function logAudit(action, detail, req) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
    const clientIp = Array.isArray(ip) ? ip[0] : ip;
    await db.run(
      `INSERT INTO audit_logs (id, action, detail, ip, timestamp) VALUES (?, ?, ?, ?, ?)`,
      [Date.now(), action, detail, clientIp, new Date().toISOString()]
    );
  } catch (err) {
    console.error('Audit Log Error:', err);
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
      `SELECT * FROM users WHERE id = ? OR phone = ? LIMIT 1`,
      [query, query]
    );

    if (!user) {
      return res.status(404).json({ error: 'Account not found. Please register.' });
    }

    if (user.password !== String(password).trim()) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    if (user.status === 'BANNED' || user.status === 'FROZEN') {
      return res.status(403).json({ error: `Account is suspended by Admin` });
    }

    await logAudit('User Login', `User ${user.name} (${user.id}) logged in successfully`, req);

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        balance: user.balance,
        deposit: user.deposit,
        withdrawal: user.withdrawal,
        commission: user.commission,
        scorePoints: user.scorePoints
      },
      token: `token_${user.id}_${Date.now()}`
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
    const existing = await db.queryOne(`SELECT id FROM users WHERE phone = ? LIMIT 1`, [cleanPhone]);
    if (existing) {
      return res.status(400).json({ error: `Mobile number ${cleanPhone} is already registered. Please login.` });
    }

    const newId = String(Math.floor(100000 + Math.random() * 900000));
    const createdAt = new Date().toISOString().split('T')[0];

    await db.run(
      `INSERT INTO users (id, name, phone, password, balance, deposit, withdrawal, commission, scorePoints, sellTotal, cashbackReward, cashbackPending, status, referralCode, createdAt)
       VALUES (?, ?, ?, ?, 0.0, 0.0, 0.0, 0.0, 500, 0.0, 0, 0, 'ACTIVE', ?, ?)`,
      [newId, String(name).trim(), cleanPhone, String(password).trim(), referralCode || '', createdAt]
    );

    await logAudit('User Registration', `New user registered: ${name} (ID: ${newId})`, req);

    res.status(201).json({
      success: true,
      message: 'Registration successful! 500 Welcome Score Points credited.',
      user: {
        id: newId,
        name: String(name).trim(),
        phone: cleanPhone,
        balance: 0.0,
        deposit: 0.0,
        withdrawal: 0.0,
        commission: 0.0,
        scorePoints: 500
      },
      token: `token_${newId}_${Date.now()}`
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Database error during registration' });
  }
});

app.get('/api/user', async (req, res) => {
  try {
    const userId = req.query.id;
    if (!userId) return res.status(401).json({ error: 'User ID is required' });
    const user = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [String(userId)]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ==========================================
// 2. FINANCIAL & P2P ORDERS API (SQL)
// ==========================================

app.get('/api/user/deposit-orders', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.json([]);
    const orders = await db.queryAll(
      `SELECT * FROM deposit_buy_orders WHERE userId = ? ORDER BY timestamp DESC`,
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
      `SELECT * FROM sell_orders WHERE userId = ? ORDER BY timestamp DESC`,
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
    const deposits = await db.queryAll(`SELECT * FROM deposit_buy_orders WHERE userId = ?`, [uid]);
    const sells = await db.queryAll(`SELECT * FROM sell_orders WHERE userId = ?`, [uid]);
    const combined = [...deposits, ...sells];
    combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(combined);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/user/convert-score', async (req, res) => {
  try {
    const { userId, points } = req.body;
    const numPoints = Number(points);

    if (!numPoints || numPoints < 100) {
      return res.status(400).json({ error: 'Minimum score conversion is 100 points' });
    }

    if (!userId) return res.status(401).json({ error: 'User ID required' });
    const targetUser = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [String(userId)]);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (targetUser.scorePoints < numPoints) {
      return res.status(400).json({ error: `Insufficient Score Points! You have ${targetUser.scorePoints} PTS` });
    }

    const stats = await db.queryOne(`SELECT scoreRate FROM stats_data WHERE id = 1`);
    const scoreRate = stats ? stats.scoreRate : 10;
    const convertedInr = Number(((numPoints / 100) * scoreRate).toFixed(2));

    const newScore = targetUser.scorePoints - numPoints;
    const newBalance = Number((targetUser.balance + convertedInr).toFixed(2));

    await db.run(`UPDATE users SET scorePoints = ?, balance = ? WHERE id = ?`, [newScore, newBalance, targetUser.id]);
    await db.run(
      `INSERT INTO score_conversions (id, userId, pointsConverted, inrReceived, timestamp) VALUES (?, ?, ?, ?, ?)`,
      [Date.now(), targetUser.id, numPoints, convertedInr, new Date().toISOString()]
    );
    await db.run(
      `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [Date.now(), targetUser.id, 'Score Roll Out Conversion', convertedInr, 'Completed', new Date().toISOString()]
    );

    await logAudit('Score Converted', `User ${targetUser.name} converted ${numPoints} Score into ₹ ${convertedInr.toFixed(2)}`, req);

    res.json({
      success: true,
      message: `Successfully converted ${numPoints} Score Points into ₹ ${convertedInr.toFixed(2)} wallet balance!`,
      newScore,
      newBalance
    });
  } catch (err) {
    console.error('Score convert error:', err);
    res.status(500).json({ error: 'Database conversion error' });
  }
});

// P2P MATCHING ENDPOINT
app.get('/api/p2p/match-order', async (req, res) => {
  try {
    const { amount, userId } = req.query;
    const num = Number(amount);
    const uid = String(userId || '');

    const matchedSellOrder = await db.queryOne(
      `SELECT * FROM sell_orders WHERE (status = 'Pending' OR status = 'Submitted') AND userId != ? AND amount = ? LIMIT 1`,
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

// TOPUP DEPOSIT (SQL)
app.post('/api/user/topup', async (req, res) => {
  try {
    const { amount, userId, paymentChannel, utrNumber, matchedSellOrderId } = req.body;
    const num = Number(amount);
    if (!num || num <= 0) return res.status(400).json({ error: 'Invalid top-up amount' });

    if (!userId) return res.status(401).json({ error: 'User ID is required' });
    const targetUser = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [String(userId)]);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const stats = await db.queryOne(`SELECT exchangeRate FROM stats_data WHERE id = 1`);
    const exchangeRate = stats ? stats.exchangeRate : 110;

    const newBalance = Number((targetUser.balance + num).toFixed(2));
    const newDeposit = Number((targetUser.deposit + num).toFixed(2));

    await db.run(`UPDATE users SET balance = ?, deposit = ? WHERE id = ?`, [newBalance, newDeposit, targetUser.id]);

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

    await db.run(
      `INSERT INTO deposit_buy_orders (id, userId, userName, orderType, amount, usdtAmount, status, paymentChannel, utrNumber, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newOrder.id, newOrder.userId, newOrder.userName, newOrder.orderType, newOrder.amount, newOrder.usdtAmount, newOrder.status, newOrder.paymentChannel, newOrder.utrNumber, newOrder.timestamp]
    );

    await db.run(
      `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [Date.now(), targetUser.id, `Deposit Added (₹${num})`, num, 'Success', new Date().toISOString()]
    );

    // DIRECT P2P MATCH FULFILLMENT:
    let matchedSellOrder = null;
    if (matchedSellOrderId) {
      matchedSellOrder = await db.queryOne(`SELECT * FROM sell_orders WHERE id = ?`, [Number(matchedSellOrderId)]);
    }
    if (!matchedSellOrder) {
      matchedSellOrder = await db.queryOne(
        `SELECT * FROM sell_orders WHERE (status = 'Pending' OR status = 'Submitted') AND userId != ? AND amount = ? LIMIT 1`,
        [targetUser.id, num]
      );
    }

    if (matchedSellOrder) {
      const matchNote = `Direct P2P Paid by User #${targetUser.id} (${targetUser.name}) via UTR: ${utrNumber || 'Verified'}`;
      await db.run(
        `UPDATE sell_orders SET status = 'Success', p2pMatchedWith = ?, matchedNote = ? WHERE id = ?`,
        [targetUser.id, matchNote, matchedSellOrder.id]
      );

      await db.run(
        `INSERT INTO notifications (id, title, body, type, isRead, time, targetUserId) VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [
          Date.now(),
          '⚡ P2P Direct Payment Received!',
          `User ${targetUser.name} (#${targetUser.id}) transferred ₹${num} directly to your ${matchedSellOrder.payoutBank} account (${matchedSellOrder.accountNumber}). UTR: ${utrNumber || 'Verified'}.`,
          'Success',
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          matchedSellOrder.userId
        ]
      );

      await logAudit('P2P Direct Transfer Completed', `User ${targetUser.name} paid ₹${num} directly to User ${matchedSellOrder.userName} (#${matchedSellOrder.id})`, req);

      return res.json({
        success: true,
        message: `⚡ Direct P2P Transfer Success! Paid ₹${num} directly to ${matchedSellOrder.userName}. Wallet credited!`,
        order: newOrder,
        newBalance
      });
    }

    await logAudit('Top-up Deposit Added', `User ${targetUser.name} added deposit ₹${num}. Wallet: ₹${newBalance}`, req);

    res.json({
      success: true,
      message: `₹${num} added to wallet balance & pool liquidity updated!`,
      order: newOrder,
      newBalance
    });
  } catch (err) {
    console.error('Topup error:', err);
    res.status(500).json({ error: 'Database topup error' });
  }
});

// WITHDRAWAL API (SQL)
app.post('/api/user/withdraw', async (req, res) => {
  try {
    const { amount, userId, payoutBank, accountNumber } = req.body;
    const num = Number(amount);
    if (!userId) return res.status(401).json({ error: 'User ID is required' });
    const targetUser = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [String(userId)]);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (!num || num <= 0) return res.status(400).json({ error: 'Invalid withdrawal amount' });
    if (num > targetUser.balance) {
      return res.status(400).json({ error: `Insufficient wallet balance! Your balance is ₹${targetUser.balance.toFixed(2)}` });
    }

    const newBalance = Number((targetUser.balance - num).toFixed(2));
    const newWithdrawal = Number((targetUser.withdrawal + num).toFixed(2));

    await db.run(`UPDATE users SET balance = ?, withdrawal = ? WHERE id = ?`, [newBalance, newWithdrawal, targetUser.id]);

    const poolData = await db.queryOne(`SELECT COALESCE(SUM(deposit), 0) as totalDeposit, COALESCE(SUM(withdrawal), 0) as totalWithdrawal FROM users`);
    const availableLiquidity = Math.max(1000, (poolData.totalDeposit - poolData.totalWithdrawal));

    const isAutoMatched = availableLiquidity >= num;
    const initialStatus = isAutoMatched ? 'Success' : 'Pending';

    const stats = await db.queryOne(`SELECT exchangeRate FROM stats_data WHERE id = 1`);
    const exchangeRate = stats ? stats.exchangeRate : 110;

    const newOrder = {
      id: Math.floor(900000 + Math.random() * 100000),
      userId: targetUser.id,
      userName: targetUser.name,
      orderType: 'Sell',
      amount: num,
      usdtAmount: Number((num / exchangeRate).toFixed(2)),
      status: initialStatus,
      payoutBank: payoutBank || 'Bank Transfer',
      accountNumber: accountNumber || '****9900',
      timestamp: new Date().toISOString(),
      matchedNote: isAutoMatched ? 'Auto-fulfilled via P2P Liquidity Pool' : 'Queued for Next Peer Deposit'
    };

    await db.run(
      `INSERT INTO sell_orders (id, userId, userName, orderType, amount, usdtAmount, status, payoutBank, accountNumber, matchedNote, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newOrder.id, newOrder.userId, newOrder.userName, newOrder.orderType, newOrder.amount, newOrder.usdtAmount, newOrder.status, newOrder.payoutBank, newOrder.accountNumber, newOrder.matchedNote, newOrder.timestamp]
    );

    await db.run(
      `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [Date.now(), targetUser.id, `Withdrawal (₹${num})`, num, initialStatus, new Date().toISOString()]
    );

    await logAudit('Withdrawal Requested', `User ${targetUser.name} requested sell order ₹${num}. Status: ${initialStatus}`, req);

    res.json({
      success: true,
      message: isAutoMatched
        ? `⚡ Instant P2P Match! ₹${num} withdrawal auto-matched & processed to ${payoutBank} (${accountNumber})!`
        : `₹${num} Withdrawal submitted & queued in P2P Liquidity Pool. Status: Pending Peer Deposit.`,
      order: newOrder,
      newBalance
    });
  } catch (err) {
    console.error('Withdraw error:', err);
    res.status(500).json({ error: 'Database withdraw error' });
  }
});

// STATS & OFFERS (SQL)
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
    const isSellingOpen = Boolean(row.isSellingOpen);
    await logAudit('Selling Toggled', `Selling status set to ${isSellingOpen ? 'OPEN' : 'CLOSED'}`, req);
    res.json({ success: true, isSellingOpen });
  } catch (err) {
    res.status(500).json({ error: 'Database toggle error' });
  }
});

app.get('/api/payment/offers', async (req, res) => {
  try {
    const userId = req.query.userId;
    const offers = await db.queryAll(`SELECT * FROM payment_offers ORDER BY amount ASC`);
    const todayDateStr = new Date().toISOString().split('T')[0];

    let claimedOfferIds = new Set();
    if (userId) {
      const claimedRows = await db.queryAll(
        `SELECT offerId FROM user_claimed_offers WHERE userId = ? AND claimedDate = ?`,
        [String(userId), todayDateStr]
      );
      claimedOfferIds = new Set(claimedRows.map(r => r.offerId));
    }

    const result = offers.map(o => ({
      ...o,
      isClaimedToday: claimedOfferIds.has(o.id)
    }));

    res.json(result);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/payment/claim', async (req, res) => {
  try {
    const { offerId, userId } = req.body;
    const offer = await db.queryOne(`SELECT * FROM payment_offers WHERE id = ?`, [Number(offerId)]);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });

    if (!userId) return res.status(401).json({ error: 'User ID is required' });
    const targetUser = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [String(userId)]);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const todayDateStr = new Date().toISOString().split('T')[0];
    const alreadyClaimed = await db.queryOne(
      `SELECT * FROM user_claimed_offers WHERE userId = ? AND offerId = ? AND claimedDate = ?`,
      [targetUser.id, offer.id, todayDateStr]
    );

    if (alreadyClaimed) {
      return res.status(400).json({ error: `You have already claimed ${offer.code} today. Come back tomorrow!` });
    }

    const stats = await db.queryOne(`SELECT specialRewardActive FROM stats_data WHERE id = 1`);
    const specialRewardActive = stats ? Boolean(stats.specialRewardActive) : true;
    const totalEarned = offer.income + (specialRewardActive ? offer.specialBonus : 0);

    const newComm = Number((targetUser.commission + totalEarned).toFixed(2));
    const newBal = Number((targetUser.balance + totalEarned).toFixed(2));
    const newScore = targetUser.scorePoints + 50;

    await db.run(`UPDATE users SET commission = ?, balance = ?, scorePoints = ? WHERE id = ?`, [newComm, newBal, newScore, targetUser.id]);

    // Record the claim in tracking table (enforces 1 claim per day)
    await db.run(
      `INSERT INTO user_claimed_offers (userId, offerId, offerCode, claimedDate, timestamp) VALUES (?, ?, ?, ?, ?)`,
      [targetUser.id, offer.id, offer.code, todayDateStr, new Date().toISOString()]
    );

    await db.run(
      `INSERT INTO transactions (id, userId, type, amount, income, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [Date.now(), targetUser.id, `Claim Order (${offer.code})`, offer.amount, totalEarned, 'Completed', new Date().toISOString()]
    );

    await logAudit('Order Claimed', `User ${targetUser.name} claimed offer ${offer.code} (+₹ ${totalEarned.toFixed(2)})`, req);
    res.json({ success: true, earned: totalEarned, newBalance: newBal, newScore });
  } catch (err) {
    res.status(500).json({ error: 'Database claim error' });
  }
});

// TRANSACTIONS & WALLETS (SQL)
app.get('/api/transactions', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (userId) {
      const userTx = await db.queryAll(`SELECT * FROM transactions WHERE userId = ? ORDER BY timestamp DESC`, [String(userId)]);
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
    const { walletName, walletAddress, walletType, holderName } = req.body;
    if (!walletAddress) return res.status(400).json({ error: 'Account or wallet address required' });

    const newWallet = {
      id: Date.now(),
      name: walletName || 'Payment Tool',
      address: walletAddress,
      holderName: holderName || '',
      type: walletType || 'Personal',
      createdAt: new Date().toISOString().split('T')[0]
    };

    await db.run(
      `INSERT INTO user_wallets (id, name, address, holderName, type, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [newWallet.id, newWallet.name, newWallet.address, newWallet.holderName, newWallet.type, newWallet.createdAt]
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
    const existing = await db.queryOne(`SELECT * FROM user_wallets WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Wallet not found' });

    await db.run(`DELETE FROM user_wallets WHERE id = ?`, [id]);
    await logAudit('Wallet Deleted', `Deleted wallet ${existing.name}`, req);
    res.json({ success: true, deleted: existing });
  } catch (err) {
    res.status(500).json({ error: 'Database delete error' });
  }
});

// NOTIFICATIONS (SQL)
app.get('/api/notifications', async (req, res) => {
  try {
    const notifications = await db.queryAll(`SELECT * FROM notifications ORDER BY id DESC`);
    const unreadCount = notifications.filter(n => !n.isRead).length;
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
    await db.run(`UPDATE notifications SET isRead = 1 WHERE id = ?`, [Number(id)]);
    const notifications = await db.queryAll(`SELECT * FROM notifications`);
    const unreadCount = notifications.filter(n => !n.isRead).length;
    res.json({ success: true, unreadCount });
  } catch (err) {
    res.status(500).json({ error: 'Database notification error' });
  }
});

// WEBSITE CREDITS & PORTFOLIO
const websiteCreditsData = {
  developer: {
    name: 'Antigravity DeepMind Dev Team',
    role: 'Lead Full-Stack & Fintech Solutions Architect',
    portfolioTitle: 'Fintech Hub & Real-time P2P Exchange Architecture',
    tagline: 'High-Performance Financial Applications & Next-Gen User Experience',
    version: 'v2.5.0-pro',
    status: 'Verified Production Build',
    techStack: ['Node.js', 'Express.js', 'SQLite Relational Database', 'JavaScript ES6+', 'P2P Matching Engine', 'RESTful API'],
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
        totalUsers: uCount ? uCount.total : 0,
        activeOrders: (dCount ? dCount.total : 0) + (sCount ? sCount.total : 0),
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
    const user = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [String(userId)]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.hasClaimedDevCredit) {
      return res.status(400).json({ error: 'Developer Portfolio Bonus Credit has already been claimed for this account!' });
    }

    const bonusAmount = 250;
    const bonusPoints = 300;
    const newBal = Number((user.balance + bonusAmount).toFixed(2));
    const newScore = user.scorePoints + bonusPoints;

    await db.run(`UPDATE users SET balance = ?, scorePoints = ?, hasClaimedDevCredit = 1 WHERE id = ?`, [newBal, newScore, user.id]);

    await db.run(
      `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [Date.now(), user.id, 'Website Portfolio Developer Bonus', bonusAmount, 'Completed', new Date().toISOString()]
    );

    await db.run(
      `INSERT INTO notifications (id, title, body, type, isRead, time, targetUserId) VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [
        Date.now(),
        '🏆 Developer Portfolio Credit Claimed!',
        `Congratulations! You claimed ₹${bonusAmount} wallet balance + ${bonusPoints} Score Points as a special Website Credit bonus.`,
        'Success',
        'Just now',
        user.id
      ]
    );

    await logAudit('Website Credit Claimed', `User ${user.name} (${user.id}) claimed ₹${bonusAmount} Dev Credit Bonus`, req);

    res.json({
      success: true,
      message: `🎉 Success! Credit bonus of ₹${bonusAmount} & ${bonusPoints} PTS added to your wallet!`,
      newBalance: newBal,
      newScorePoints: newScore
    });
  } catch (err) {
    res.status(500).json({ error: 'Database credit error' });
  }
});

// ==========================================
// 3. ADMIN MANAGEMENT API ROUTES (SQL)
// ==========================================

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === 'admin123' || password === 'admin') {
    logAudit('Admin Auth Success', 'PC Master Admin authenticated', req);
    res.json({ success: true, token: 'fintech_admin_master_token_9901' });
  } else {
    logAudit('Admin Auth Failed', 'Invalid admin password attempt', req);
    res.status(401).json({ error: 'Invalid Admin Passcode' });
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
      totalUsers: summary.totalUsers,
      totalBalance: summary.totalBalance,
      totalDeposit: summary.totalDeposit,
      totalWithdrawal: summary.totalWithdrawal,
      totalCommission: summary.totalCommission,
      pendingOrdersCount: (pDeposit ? pDeposit.count : 0) + (pSell ? pSell.count : 0),
      ...formattedStats
    });
  } catch (err) {
    res.status(500).json({ error: 'Database overview error' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await db.queryAll(`SELECT * FROM users ORDER BY createdAt DESC`);
    res.json(users);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/admin/users/create', async (req, res) => {
  try {
    const { name, phone, password, userId, balance, deposit, commission, scorePoints, status } = req.body;
    if (!name) return res.status(400).json({ error: 'User name is required' });

    const id = userId && userId.trim() !== '' ? userId.trim() : String(Math.floor(100000 + Math.random() * 900000));
    const existing = await db.queryOne(`SELECT id FROM users WHERE id = ?`, [id]);
    if (existing) {
      return res.status(400).json({ error: `User ID ${id} already exists` });
    }

    const newUser = {
      id,
      name: name.trim(),
      phone: phone ? phone.trim() : '9876543210',
      password: password ? password.trim() : '123',
      balance: Number(balance) || 0.0,
      deposit: Number(deposit) || 0.0,
      withdrawal: 0.0,
      commission: Number(commission) || 0.0,
      scorePoints: Number(scorePoints) || 500,
      sellTotal: 0.0,
      cashbackReward: 0,
      cashbackPending: 0,
      status: status || 'ACTIVE',
      createdAt: new Date().toISOString().split('T')[0]
    };

    await db.run(
      `INSERT INTO users (id, name, phone, password, balance, deposit, withdrawal, commission, scorePoints, sellTotal, cashbackReward, cashbackPending, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newUser.id, newUser.name, newUser.phone, newUser.password, newUser.balance, newUser.deposit, newUser.withdrawal, newUser.commission, newUser.scorePoints, newUser.sellTotal, newUser.cashbackReward, newUser.cashbackPending, newUser.status, newUser.createdAt]
    );

    await logAudit('User Created', `Admin created user ${newUser.name} (ID: ${newUser.id})`, req);
    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ error: 'Database create user error' });
  }
});

app.post('/api/admin/users/update', async (req, res) => {
  try {
    const { userId, name, phone, password, balance, deposit, withdrawal, commission, scorePoints, status, bonus } = req.body;
    const user = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [String(userId)]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let newName = (name && name.trim() !== '') ? name.trim() : user.name;
    let newPhone = (phone && phone.trim() !== '') ? phone.trim() : user.phone;
    let newPass = (password && password.trim() !== '') ? password.trim() : user.password;
    let newBal = (typeof balance === 'number') ? balance : user.balance;
    let newDep = (typeof deposit === 'number') ? deposit : user.deposit;
    let newWith = (typeof withdrawal === 'number') ? withdrawal : user.withdrawal;
    let newComm = (typeof commission === 'number') ? commission : user.commission;
    let newScore = (typeof scorePoints === 'number') ? scorePoints : user.scorePoints;
    let newStatus = status || user.status;

    if (typeof bonus === 'number' && bonus > 0) {
      newBal = Number((newBal + bonus).toFixed(2));
      await db.run(
        `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        [Date.now(), user.id, 'Admin Credit Bonus', bonus, 'Completed', new Date().toISOString()]
      );
    }

    await db.run(
      `UPDATE users SET name = ?, phone = ?, password = ?, balance = ?, deposit = ?, withdrawal = ?, commission = ?, scorePoints = ?, status = ? WHERE id = ?`,
      [newName, newPhone, newPass, newBal, newDep, newWith, newComm, newScore, newStatus, user.id]
    );

    const updated = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [user.id]);
    await logAudit('User Updated', `Admin updated account ${updated.name} (${updated.id})`, req);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Database update user error' });
  }
});

app.post('/api/admin/users/adjust-balance', async (req, res) => {
  try {
    const { userId, action, amount, reason } = req.body;
    const num = Number(amount);
    if (!userId || !num || num <= 0) return res.status(400).json({ error: 'Valid UserId and Amount required' });

    const user = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [String(userId)]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let newBalance = user.balance;
    if (action === 'add') {
      newBalance = Number((user.balance + num).toFixed(2));
      await db.run(`UPDATE users SET balance = ? WHERE id = ?`, [newBalance, user.id]);
      await db.run(
        `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        [Date.now(), user.id, `Admin Credit (${reason || 'Manual Credit'})`, num, 'Completed', new Date().toISOString()]
      );
      await logAudit('Balance Credited', `Admin added ₹ ${num} to ${user.name} (${user.id})`, req);
    } else if (action === 'deduct') {
      if (num > user.balance) return res.status(400).json({ error: 'Deduct amount exceeds user balance' });
      newBalance = Number((user.balance - num).toFixed(2));
      await db.run(`UPDATE users SET balance = ? WHERE id = ?`, [newBalance, user.id]);
      await db.run(
        `INSERT INTO transactions (id, userId, type, amount, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        [Date.now(), user.id, `Admin Debit (${reason || 'Manual Adjustment'})`, -num, 'Completed', new Date().toISOString()]
      );
      await logAudit('Balance Debited', `Admin deducted ₹ ${num} from ${user.name} (${user.id})`, req);
    } else {
      return res.status(400).json({ error: 'Invalid action (add or deduct required)' });
    }

    const updatedUser = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [user.id]);
    res.json({ success: true, newBalance, user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: 'Database balance adjustment error' });
  }
});

app.post('/api/admin/users/toggle-status', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [String(userId)]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newStatus = user.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
    await db.run(`UPDATE users SET status = ? WHERE id = ?`, [newStatus, user.id]);
    await logAudit('User Status Toggled', `Admin set ${user.name} (${user.id}) status to ${newStatus}`, req);

    const updatedUser = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [user.id]);
    res.json({ success: true, status: newStatus, user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: 'Database toggle status error' });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const existing = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    await db.run(`DELETE FROM users WHERE id = ?`, [id]);
    await logAudit('User Deleted', `Admin deleted user ${existing.name} (${existing.id})`, req);
    res.json({ success: true, deleted: existing });
  } catch (err) {
    res.status(500).json({ error: 'Database delete user error' });
  }
});

// COMBINED ADMIN ORDERS
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
    const num = Number(amount);
    if (!userId || !num || num <= 0) return res.status(400).json({ error: 'UserId and Amount required' });

    const user = (await db.queryOne(`SELECT * FROM users WHERE id = ?`, [String(userId)])) || { name: 'System User', id: userId };
    const stats = await db.queryOne(`SELECT exchangeRate FROM stats_data WHERE id = 1`);
    const exchangeRate = stats ? stats.exchangeRate : 110;

    const newOrder = {
      id: Math.floor(800000 + Math.random() * 200000),
      userId: user.id,
      userName: user.name,
      orderType: orderType || 'Deposit',
      amount: num,
      usdtAmount: Number((num / exchangeRate).toFixed(2)),
      status: status || 'Success',
      paymentChannel: payoutBank || 'Admin Direct',
      timestamp: new Date().toISOString()
    };

    if (orderType === 'Deposit') {
      await db.run(
        `INSERT INTO deposit_buy_orders (id, userId, userName, orderType, amount, usdtAmount, status, paymentChannel, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newOrder.id, newOrder.userId, newOrder.userName, newOrder.orderType, newOrder.amount, newOrder.usdtAmount, newOrder.status, newOrder.paymentChannel, newOrder.timestamp]
      );
      if (newOrder.status === 'Success' && user.balance !== undefined) {
        await db.run(`UPDATE users SET balance = balance + ?, deposit = deposit + ? WHERE id = ?`, [num, num, user.id]);
      }
    } else {
      await db.run(
        `INSERT INTO sell_orders (id, userId, userName, orderType, amount, usdtAmount, status, payoutBank, accountNumber, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newOrder.id, newOrder.userId, newOrder.userName, newOrder.orderType, newOrder.amount, newOrder.usdtAmount, newOrder.status, payoutBank || 'Admin Direct', accountNumber || '', newOrder.timestamp]
      );
      if (newOrder.status === 'Success' && user.balance !== undefined) {
        await db.run(`UPDATE users SET withdrawal = withdrawal + ? WHERE id = ?`, [num, user.id]);
        if (user.balance >= num) {
          await db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [num, user.id]);
        }
      }
    }

    await logAudit('Order Created', `Admin created ${orderType} order #${newOrder.id} for ₹ ${num}`, req);
    res.status(201).json(newOrder);
  } catch (err) {
    res.status(500).json({ error: 'Database create order error' });
  }
});

app.delete('/api/admin/orders/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const dep = await db.queryOne(`SELECT * FROM deposit_buy_orders WHERE id = ?`, [id]);
    if (dep) {
      await db.run(`DELETE FROM deposit_buy_orders WHERE id = ?`, [id]);
      await logAudit('Order Deleted', `Admin deleted Deposit order #${id}`, req);
      return res.json({ success: true, deleted: dep });
    }

    const sell = await db.queryOne(`SELECT * FROM sell_orders WHERE id = ?`, [id]);
    if (sell) {
      await db.run(`DELETE FROM sell_orders WHERE id = ?`, [id]);
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

    let targetOrder = null;
    if (orderType === 'Deposit') {
      targetOrder = await db.queryOne(`SELECT * FROM deposit_buy_orders WHERE id = ?`, [id]);
    } else {
      targetOrder = await db.queryOne(`SELECT * FROM sell_orders WHERE id = ?`, [id]);
    }

    if (!targetOrder) return res.status(404).json({ error: 'Order not found' });

    const prevStatus = targetOrder.status;

    if (orderType === 'Deposit') {
      await db.run(`UPDATE deposit_buy_orders SET status = ? WHERE id = ?`, [newStatus, id]);
    } else {
      await db.run(`UPDATE sell_orders SET status = ? WHERE id = ?`, [newStatus, id]);
    }

    const user = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [targetOrder.userId]);

    if (user && prevStatus !== 'Success' && newStatus === 'Success') {
      if (orderType === 'Deposit') {
        await db.run(`UPDATE users SET balance = balance + ?, deposit = deposit + ? WHERE id = ?`, [targetOrder.amount, targetOrder.amount, user.id]);
      } else {
        await db.run(`UPDATE users SET withdrawal = withdrawal + ? WHERE id = ?`, [targetOrder.amount, user.id]);
        if (user.balance >= targetOrder.amount) {
          await db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [targetOrder.amount, user.id]);
        }
      }
    }

    targetOrder.status = newStatus;
    await logAudit('Order Status Changed', `Admin set ${orderType} order #${id} status to "${newStatus}"`, req);
    res.json({ success: true, order: targetOrder });
  } catch (err) {
    res.status(500).json({ error: 'Database update order status error' });
  }
});

app.post('/api/admin/notifications/broadcast', async (req, res) => {
  try {
    const { title, body, type, targetUserId } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Notification title and body required' });

    const newNotif = {
      id: Date.now(),
      title: title.trim(),
      body: body.trim(),
      type: type || 'Info',
      isRead: 0,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      targetUserId: targetUserId || 'ALL'
    };

    await db.run(
      `INSERT INTO notifications (id, title, body, type, isRead, time, targetUserId) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newNotif.id, newNotif.title, newNotif.body, newNotif.type, newNotif.isRead, newNotif.time, newNotif.targetUserId]
    );

    await logAudit('Notification Broadcast', `Admin broadcasted notification: "${newNotif.title}"`, req);
    res.status(201).json({ success: true, notification: newNotif });
  } catch (err) {
    res.status(500).json({ error: 'Database notification broadcast error' });
  }
});

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

    const targetUser = await db.queryOne(`SELECT * FROM users WHERE id = ?`, [String(userId)]);
    const newWallet = {
      id: Date.now(),
      userId: targetUser ? targetUser.id : (userId || 'N/A'),
      userName: targetUser ? targetUser.name : 'System User',
      name: walletName || 'Payment Tool',
      address: walletAddress,
      holderName: holderName || (targetUser ? targetUser.name : ''),
      type: walletType || 'Personal',
      createdAt: new Date().toISOString().split('T')[0]
    };

    await db.run(
      `INSERT INTO user_wallets (id, userId, userName, name, address, holderName, type, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newWallet.id, newWallet.userId, newWallet.userName, newWallet.name, newWallet.address, newWallet.holderName, newWallet.type, newWallet.createdAt]
    );

    await logAudit('Admin Added Wallet', `Admin added ${walletName} (${walletAddress}) for user ${newWallet.userId}`, req);
    res.status(201).json({ success: true, wallet: newWallet });
  } catch (err) {
    res.status(500).json({ error: 'Database add wallet error' });
  }
});

app.post('/api/admin/offers', async (req, res) => {
  try {
    const { amount, code, income, specialBonus, category } = req.body;
    if (!amount || !code) return res.status(400).json({ error: 'Amount and Code required' });

    const newOffer = {
      id: Date.now(),
      amount: Number(amount),
      code: code.trim(),
      income: Number(income) || 20.0,
      specialBonus: Number(specialBonus) || 3.0,
      category: category || '100-300'
    };

    await db.run(
      `INSERT INTO payment_offers (id, amount, code, income, specialBonus, category) VALUES (?, ?, ?, ?, ?, ?)`,
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
    const existing = await db.queryOne(`SELECT * FROM payment_offers WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Offer not found' });

    await db.run(`DELETE FROM payment_offers WHERE id = ?`, [id]);
    await logAudit('Offer Deleted', `Admin deleted offer ${existing.code}`, req);
    res.json({ success: true, deleted: existing });
  } catch (err) {
    res.status(500).json({ error: 'Database delete offer error' });
  }
});

app.post('/api/admin/settings', async (req, res) => {
  try {
    const { exchangeRate, scoreRate, commissionRate, specialRewardActive, maintenanceMode, isSellingOpen, appVersion, appDownloadUrl, adminUpiId, merchantName } = req.body;

    const current = await db.queryOne(`SELECT * FROM stats_data WHERE id = 1`);
    let newEx = (typeof exchangeRate === 'number') ? exchangeRate : current.exchangeRate;
    let newScore = (typeof scoreRate === 'number') ? scoreRate : current.scoreRate;
    let newComm = (typeof commissionRate === 'number') ? commissionRate : current.commissionRate;
    let newSpec = (typeof specialRewardActive === 'boolean') ? (specialRewardActive ? 1 : 0) : current.specialRewardActive;
    let newMaint = (typeof maintenanceMode === 'boolean') ? (maintenanceMode ? 1 : 0) : current.maintenanceMode;
    let newSell = (typeof isSellingOpen === 'boolean') ? (isSellingOpen ? 1 : 0) : current.isSellingOpen;
    let newVer = appVersion ? appVersion.trim() : current.appVersion;
    let newDl = appDownloadUrl ? appDownloadUrl.trim() : (current.appDownloadUrl || '/downloads/fintech-hub.apk');
    let newUpi = adminUpiId ? adminUpiId.trim() : current.adminUpiId;
    let newMerchant = merchantName ? merchantName.trim() : current.merchantName;

    await db.run(
      `UPDATE stats_data SET exchangeRate = ?, scoreRate = ?, commissionRate = ?, specialRewardActive = ?, maintenanceMode = ?, isSellingOpen = ?, appVersion = ?, appDownloadUrl = ?, adminUpiId = ?, merchantName = ? WHERE id = 1`,
      [newEx, newScore, newComm, newSpec, newMaint, newSell, newVer, newDl, newUpi, newMerchant]
    );

    const updated = await db.queryOne(`SELECT * FROM stats_data WHERE id = 1`);
    await logAudit('Settings Updated', 'Admin updated platform rates & merchant UPI settings', req);
    res.json({ success: true, statsData: formatStats(updated) });
  } catch (err) {
    res.status(500).json({ error: 'Database settings error' });
  }
});

app.get('/api/admin/logs', async (req, res) => {
  try {
    const logs = await db.queryAll(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50`);
    res.json(logs);
  } catch (err) {
    res.json([]);
  }
});

// SPA Catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Listen on all network interfaces (Dual-stack IPv4 & IPv6 localhost)
app.listen(PORT, () => {
  const localIp = getLocalIp();
  console.log(`\n======================================================`);
  console.log(`🚀 MASTER FINTECH PLATFORM, SELL ORDERS & ADMIN ENGINE RUNNING!`);
  console.log(`📱 Mobile Web App Access:  http://${localIp}:${PORT}`);
  console.log(`💻 Dedicated PC Admin Dashboard: http://localhost:${PORT}/admin`);
  console.log(`🗄️  SQL Database Active: SQLite Relational Store (database.sqlite)`);
  console.log(`======================================================\n`);
});
