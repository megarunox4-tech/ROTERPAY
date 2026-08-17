const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Dedicated Admin Portal Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Multi-User Database Storage
let users = [];

let statsData = {
  exchangeRate: 110,
  scoreRate: 10,
  inProcessAmount: 0.00,
  inProcessOrders: 0,
  commissionRate: 4.00,
  estimatedIncome: 0.00,
  isSellingOpen: false,
  specialRewardActive: true,
  maintenanceMode: false,
  adminUpiId: '8104229900@upi',
  merchantName: 'Fintech Hub',
  adminQrText: 'Scan & Pay via GPay / PhonePe / Paytm',
  appVersion: 'v1.1.9',
  date: new Date().toLocaleDateString('en-GB')
};

let notifications = [];

let paymentOffers = [];

let userWallets = [];

// DEPOSIT BUY ORDERS STORAGE
let depositBuyOrders = [];

// SELL ORDERS (WITHDRAWALS) STORAGE
let sellOrders = [];

let pendingOrders = [];
let transactions = [];
let scoreConversions = [];
let auditLogs = [
  { id: 1, action: 'Server Startup', detail: 'Express backend listening on 0.0.0.0:3000', ip: '127.0.0.1', timestamp: new Date().toISOString() }
];

function logAudit(action, detail, req) {
  const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
  auditLogs.unshift({ id: Date.now(), action, detail, ip, timestamp: new Date().toISOString() });
}

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

// DEPOSIT BUY ORDERS API
app.get('/api/user/deposit-orders', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.json([]);
  const orders = depositBuyOrders.filter(o => o.userId === userId);
  res.json(orders);
});

// SELL ORDERS API
app.get('/api/user/sell-orders', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.json([]);
  const orders = sellOrders.filter(o => o.userId === userId);
  res.json(orders);
});

// SCORE CONVERSION API
app.post('/api/user/convert-score', (req, res) => {
  const { userId, points } = req.body;
  const numPoints = Number(points);

  if (!numPoints || numPoints < 100) {
    return res.status(400).json({ error: 'Minimum score conversion is 100 points' });
  }

  if (!userId) return res.status(401).json({ error: 'User ID required' });
  const targetUser = users.find(u => u.id === userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  if (targetUser.scorePoints < numPoints) {
    return res.status(400).json({ error: `Insufficient Score Points! You have ${targetUser.scorePoints} PTS` });
  }

  const convertedInr = (numPoints / 100) * statsData.scoreRate;

  targetUser.scorePoints -= numPoints;
  targetUser.balance += convertedInr;

  const record = {
    id: Date.now(),
    userId: targetUser.id,
    pointsConverted: numPoints,
    inrReceived: convertedInr,
    timestamp: new Date().toISOString()
  };

  scoreConversions.unshift(record);
  transactions.unshift({
    id: Date.now(),
    userId: targetUser.id,
    type: 'Score Roll Out Conversion',
    amount: convertedInr,
    status: 'Completed',
    timestamp: new Date().toISOString()
  });

  logAudit('Score Converted', `User ${targetUser.name} converted ${numPoints} Score into ₹ ${convertedInr.toFixed(2)}`, req);

  res.json({
    success: true,
    message: `Successfully converted ${numPoints} Score Points into ₹ ${convertedInr.toFixed(2)} wallet balance!`,
    newScore: targetUser.scorePoints,
    newBalance: targetUser.balance
  });
});

// USER AUTHENTICATION API ROUTES
app.post('/api/auth/login', (req, res) => {
  const { loginInput, password } = req.body;
  if (!loginInput || !password) return res.status(400).json({ error: 'Mobile number/ID and password required' });

  const query = loginInput.trim();
  const user = users.find(u => u.id === query || u.phone === query);

  if (!user) return res.status(404).json({ error: 'Account not found. Please register.' });
  if (user.password !== password.trim()) return res.status(401).json({ error: 'Incorrect password' });
  if (user.status === 'BANNED') return res.status(403).json({ error: 'Account is suspended by Admin' });

  logAudit('User Login', `User ${user.name} (${user.id}) logged in successfully`, req);
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
});

app.post('/api/auth/register', (req, res) => {
  const { name, phone, password, referralCode } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'Full Name, Phone, and Password are required' });

  const cleanPhone = phone.trim();
  if (users.some(u => u.phone === cleanPhone)) {
    return res.status(400).json({ error: `Mobile number ${cleanPhone} is already registered. Please login.` });
  }

  const newId = String(Math.floor(100000 + Math.random() * 900000));
  const newUser = {
    id: newId,
    name: name.trim(),
    phone: cleanPhone,
    password: password.trim(),
    balance: 0.00,
    deposit: 0.00,
    withdrawal: 0.00,
    commission: 0.00,
    scorePoints: 500,
    sellTotal: 0.00,
    cashbackReward: 0,
    cashbackPending: 0,
    status: 'ACTIVE',
    referralCode: referralCode || '',
    createdAt: new Date().toISOString().split('T')[0]
  };

  users.unshift(newUser);
  logAudit('User Registration', `New user registered: ${newUser.name} (ID: ${newUser.id})`, req);

  res.status(201).json({
    success: true,
    message: 'Registration successful! 500 Welcome Score Points credited.',
    user: {
      id: newUser.id,
      name: newUser.name,
      phone: newUser.phone,
      balance: newUser.balance,
      deposit: newUser.deposit,
      withdrawal: newUser.withdrawal,
      commission: newUser.commission,
      scorePoints: newUser.scorePoints
    },
    token: `token_${newUser.id}_${Date.now()}`
  });
});

// NOTIFICATIONS API ROUTES
app.get('/api/notifications', (req, res) => {
  const unreadCount = notifications.filter(n => !n.isRead).length;
  res.json({ notifications, unreadCount });
});

app.post('/api/notifications/read', (req, res) => {
  const { id, markAll } = req.body;

  if (markAll) {
    notifications.forEach(n => n.isRead = true);
    return res.json({ success: true, unreadCount: 0 });
  }

  const item = notifications.find(n => n.id === Number(id));
  if (item) item.isRead = true;
  const unreadCount = notifications.filter(n => !n.isRead).length;
  res.json({ success: true, unreadCount });
});

app.post('/api/admin/notifications/broadcast', (req, res) => {
  const { title, body, type } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Notification title and body required' });

  const newNotif = {
    id: Date.now(),
    title: title.trim(),
    body: body.trim(),
    type: type || 'Info',
    isRead: false,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  notifications.unshift(newNotif);
  logAudit('Notification Broadcast', `Admin broadcasted notification: "${newNotif.title}"`, req);
  res.status(201).json({ success: true, notification: newNotif });
});

// PUBLIC USER & APP ROUTES

app.get('/api/user', (req, res) => {
  const userId = req.query.id;
  if (!userId) return res.status(401).json({ error: 'User ID is required' });
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// DIRECT P2P ORDER MATCHING ENDPOINT
app.get('/api/p2p/match-order', (req, res) => {
  const { amount, userId } = req.query;
  const num = Number(amount);

  // Find an active pending sell order (withdrawal) from another user matching amount
  const matchedSellOrder = sellOrders.find(s => 
    (s.status === 'Pending' || s.status === 'Submitted') && 
    s.userId !== userId && 
    s.amount === num
  );

  if (matchedSellOrder) {
    const peerUpi = matchedSellOrder.accountNumber.includes('@') 
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
    // Return admin merchant details if no peer is waiting for withdrawal right now
    res.json({
      hasMatch: false,
      peerName: statsData.merchantName,
      upiId: statsData.adminUpiId,
      amount: num
    });
  }
});

app.post('/api/user/topup', (req, res) => {
  const { amount, userId, paymentChannel, utrNumber, matchedSellOrderId } = req.body;
  const num = Number(amount);
  if (!num || num <= 0) return res.status(400).json({ error: 'Invalid top-up amount' });

  if (!userId) return res.status(401).json({ error: 'User ID is required' });
  const targetUser = users.find(u => u.id === userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  // 1. Instantly credit deposit amount to User A's wallet balance
  targetUser.balance += num;
  targetUser.deposit += num;

  const newOrder = {
    id: Math.floor(800000 + Math.random() * 100000),
    userId: targetUser.id,
    userName: targetUser.name,
    orderType: 'Deposit',
    amount: num,
    usdtAmount: Math.round(num / statsData.exchangeRate),
    status: 'Success',
    paymentChannel: paymentChannel || 'UPI Direct',
    utrNumber: utrNumber || 'Auto-Verified P2P',
    timestamp: new Date().toISOString()
  };

  depositBuyOrders.unshift(newOrder);

  transactions.unshift({
    id: Date.now(),
    userId: targetUser.id,
    type: `Deposit Added (₹${num})`,
    amount: num,
    status: 'Success',
    timestamp: new Date().toISOString()
  });

  // 2. DIRECT P2P MATCH FULFILLMENT:
  let matchedSellOrder = null;
  if (matchedSellOrderId) {
    matchedSellOrder = sellOrders.find(s => s.id === Number(matchedSellOrderId));
  }
  if (!matchedSellOrder) {
    matchedSellOrder = sellOrders.find(s => (s.status === 'Pending' || s.status === 'Submitted') && s.userId !== targetUser.id && s.amount === num);
  }

  if (matchedSellOrder) {
    matchedSellOrder.status = 'Success';
    matchedSellOrder.p2pMatchedWith = targetUser.id;
    matchedSellOrder.matchedNote = `Direct P2P Paid by User #${targetUser.id} (${targetUser.name}) via UTR: ${utrNumber || 'Verified'}`;
    newOrder.matchedNote = `Direct P2P Paid to User #${matchedSellOrder.userId} (${matchedSellOrder.userName}) Bank Account`;
    
    // Add Notification for User 2 (Withdrawal Requestor)
    notifications.unshift({
      id: Date.now(),
      title: '⚡ P2P Direct Payment Received!',
      body: `User ${targetUser.name} (#${targetUser.id}) transferred ₹${num} directly to your ${matchedSellOrder.payoutBank} account (${matchedSellOrder.accountNumber}). UTR: ${utrNumber || 'Verified'}.`,
      type: 'Success',
      isRead: false,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    logAudit('P2P Direct Transfer Completed', `User ${targetUser.name} paid ₹${num} directly to User ${matchedSellOrder.userName} (Withdrawal Order #${matchedSellOrder.id})`, req);

    return res.json({
      success: true,
      message: `⚡ Direct P2P Transfer Success! Paid ₹${num} directly to ${matchedSellOrder.userName}. Wallet credited!`,
      order: newOrder,
      newBalance: targetUser.balance
    });
  }

  logAudit('Top-up Deposit Added', `User ${targetUser.name} added deposit ₹${num}. Wallet balance updated to ₹${targetUser.balance.toFixed(2)}`, req);

  res.json({
    success: true,
    message: `₹${num} added to wallet balance & pool liquidity updated!`,
    order: newOrder,
    newBalance: targetUser.balance
  });
});

app.post('/api/user/withdraw', (req, res) => {
  const { amount, userId, payoutBank, accountNumber } = req.body;
  const num = Number(amount);
  if (!userId) return res.status(401).json({ error: 'User ID is required' });
  const targetUser = users.find(u => u.id === userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  if (!num || num <= 0) return res.status(400).json({ error: 'Invalid withdrawal amount' });
  if (num > targetUser.balance) return res.status(400).json({ error: `Insufficient wallet balance! Your balance is ₹${targetUser.balance.toFixed(2)}` });

  // Deduct balance from user
  targetUser.balance -= num;
  targetUser.withdrawal += num;

  // Check liquidity pool (sum of deposits vs withdrawals)
  const totalDepositPool = users.reduce((acc, u) => acc + u.deposit, 0);
  const totalWithdrawalDone = users.reduce((acc, u) => acc + u.withdrawal, 0);
  const availableLiquidity = Math.max(1000, totalDepositPool - totalWithdrawalDone);

  // Auto-match P2P withdrawal if liquidity is sufficient
  const isAutoMatched = availableLiquidity >= num;
  const initialStatus = isAutoMatched ? 'Success' : 'Pending';

  const newOrder = {
    id: Math.floor(900000 + Math.random() * 100000),
    userId: targetUser.id,
    userName: targetUser.name,
    orderType: 'Sell',
    amount: num,
    usdtAmount: Number((num / statsData.exchangeRate).toFixed(2)),
    status: initialStatus,
    payoutBank: payoutBank || 'Bank Transfer',
    accountNumber: accountNumber || '****9900',
    timestamp: new Date().toISOString(),
    matchedNote: isAutoMatched ? 'Auto-fulfilled via P2P Liquidity Pool' : 'Queued for Next Peer Deposit'
  };

  sellOrders.unshift(newOrder);

  transactions.unshift({
    id: Date.now(),
    userId: targetUser.id,
    type: `Withdrawal (₹${num})`,
    amount: num,
    status: initialStatus,
    timestamp: new Date().toISOString()
  });

  logAudit('Withdrawal Requested', `User ${targetUser.name} requested sell order ₹${num}. Status: ${initialStatus}`, req);

  res.json({
    success: true,
    message: isAutoMatched
      ? `⚡ Instant P2P Match! ₹${num} withdrawal auto-matched & processed to ${payoutBank} (${accountNumber})!`
      : `₹${num} Withdrawal submitted & queued in P2P Liquidity Pool. Status: Pending Peer Deposit.`,
    order: newOrder,
    newBalance: targetUser.balance
  });
});

app.get('/api/user/orders', (req, res) => {
  const userId = req.query.id;
  if (!userId) return res.json([]);
  const userDeposits = depositBuyOrders.filter(o => o.userId === userId);
  const userSells = sellOrders.filter(o => o.userId === userId);
  const combined = [...userDeposits, ...userSells];
  combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(combined);
});

app.get('/api/stats', (req, res) => res.json(statsData));

app.post('/api/stats/toggle-selling', (req, res) => {
  statsData.isSellingOpen = !statsData.isSellingOpen;
  logAudit('Selling Toggled', `Selling status set to ${statsData.isSellingOpen ? 'OPEN' : 'CLOSED'}`, req);
  res.json({ success: true, isSellingOpen: statsData.isSellingOpen });
});

app.get('/api/payment/offers', (req, res) => res.json(paymentOffers));

app.post('/api/payment/claim', (req, res) => {
  const { offerId, userId } = req.body;
  const offer = paymentOffers.find(o => o.id === Number(offerId));
  if (!offer) return res.status(404).json({ error: 'Offer not found' });

  if (!userId) return res.status(401).json({ error: 'User ID is required' });
  const targetUser = users.find(u => u.id === userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  const totalEarned = offer.income + (statsData.specialRewardActive ? offer.specialBonus : 0);

  targetUser.commission += totalEarned;
  targetUser.balance += totalEarned;
  targetUser.scorePoints += 50;

  transactions.unshift({
    id: Date.now(),
    userId: targetUser.id,
    type: `Claim Order (${offer.code})`,
    amount: offer.amount,
    income: totalEarned,
    status: 'Completed',
    timestamp: new Date().toISOString()
  });

  logAudit('Order Claimed', `User ${targetUser.name} claimed offer ${offer.code} (+₹ ${totalEarned.toFixed(2)})`, req);
  res.json({ success: true, earned: totalEarned, newBalance: targetUser.balance, newScore: targetUser.scorePoints });
});

app.get('/api/transactions', (req, res) => res.json(transactions));
app.get('/api/wallets', (req, res) => res.json(userWallets));

app.post('/api/wallets', (req, res) => {
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
  userWallets.unshift(newWallet);
  logAudit('Wallet Added', `Added ${walletName} (${walletAddress})`, req);
  res.status(201).json(newWallet);
});

app.delete('/api/wallets/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = userWallets.findIndex(w => w.id === id);
  if (index !== -1) {
    const deleted = userWallets.splice(index, 1)[0];
    logAudit('Wallet Deleted', `Deleted wallet ${deleted.name}`, req);
    return res.json({ success: true, deleted });
  }
  res.status(404).json({ error: 'Wallet not found' });
});


// PC ADMIN API ROUTES FOR BOTH DEPOSIT AND SELL ORDERS

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

app.get('/api/admin/overview', (req, res) => {
  const totalBalance = users.reduce((acc, u) => acc + u.balance, 0);
  const totalDeposit = users.reduce((acc, u) => acc + u.deposit, 0);
  const totalWithdrawal = users.reduce((acc, u) => acc + u.withdrawal, 0);
  const totalCommission = users.reduce((acc, u) => acc + u.commission, 0);
  
  const pendingDepositCount = depositBuyOrders.filter(o => o.status === 'Processing' || o.status === 'Submit').length;
  const pendingSellCount = sellOrders.filter(o => o.status === 'Pending' || o.status === 'Submitted').length;

  res.json({
    totalUsers: users.length,
    totalBalance,
    totalDeposit,
    totalWithdrawal,
    totalCommission,
    pendingOrdersCount: pendingDepositCount + pendingSellCount,
    exchangeRate: statsData.exchangeRate,
    scoreRate: statsData.scoreRate,
    commissionRate: statsData.commissionRate,
    specialRewardActive: statsData.specialRewardActive,
    isSellingOpen: statsData.isSellingOpen,
    maintenanceMode: statsData.maintenanceMode,
    appVersion: statsData.appVersion
  });
});

app.get('/api/admin/users', (req, res) => res.json(users));

app.post('/api/admin/users/create', (req, res) => {
  const { name, phone, password, userId, balance, deposit, commission, scorePoints, status } = req.body;
  if (!name) return res.status(400).json({ error: 'User name is required' });

  const id = userId && userId.trim() !== '' ? userId.trim() : String(Math.floor(100000 + Math.random() * 900000));

  if (users.some(u => u.id === id)) {
    return res.status(400).json({ error: `User ID ${id} already exists` });
  }

  const newUser = {
    id,
    name: name.trim(),
    phone: phone ? phone.trim() : '9876543210',
    password: password ? password.trim() : '123',
    balance: Number(balance) || 0.00,
    deposit: Number(deposit) || 0.00,
    withdrawal: 0.00,
    commission: Number(commission) || 0.00,
    scorePoints: Number(scorePoints) || 500,
    sellTotal: 0.00,
    cashbackReward: 0,
    cashbackPending: 0,
    status: status || 'ACTIVE',
    createdAt: new Date().toISOString().split('T')[0]
  };

  users.unshift(newUser);
  logAudit('User Created', `Admin created user ${newUser.name} (ID: ${newUser.id})`, req);
  res.status(201).json(newUser);
});

app.post('/api/admin/users/update', (req, res) => {
  const { userId, name, phone, password, balance, deposit, withdrawal, commission, scorePoints, status, bonus } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (name && name.trim() !== '') user.name = name.trim();
  if (phone && phone.trim() !== '') user.phone = phone.trim();
  if (password && password.trim() !== '') user.password = password.trim();

  if (typeof balance === 'number') user.balance = balance;
  if (typeof deposit === 'number') user.deposit = deposit;
  if (typeof withdrawal === 'number') user.withdrawal = withdrawal;
  if (typeof commission === 'number') user.commission = commission;
  if (typeof scorePoints === 'number') user.scorePoints = scorePoints;
  if (status) user.status = status;

  if (typeof bonus === 'number' && bonus > 0) {
    user.balance += bonus;
    transactions.unshift({
      id: Date.now(),
      userId: user.id,
      type: 'Admin Credit Bonus',
      amount: bonus,
      status: 'Completed',
      timestamp: new Date().toISOString()
    });
  }

  logAudit('User Updated', `Admin updated account ${user.name} (${user.id})`, req);
  res.json({ success: true, user });
});

// QUICK ADJUST USER BALANCE (ADD / DEDUCT)
app.post('/api/admin/users/adjust-balance', (req, res) => {
  const { userId, action, amount, reason } = req.body;
  const num = Number(amount);
  if (!userId || !num || num <= 0) return res.status(400).json({ error: 'Valid UserId and Amount required' });

  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (action === 'add') {
    user.balance += num;
    transactions.unshift({
      id: Date.now(),
      userId: user.id,
      type: `Admin Credit (${reason || 'Manual Credit'})`,
      amount: num,
      status: 'Completed',
      timestamp: new Date().toISOString()
    });
    logAudit('Balance Credited', `Admin added ₹ ${num} to ${user.name} (${user.id})`, req);
  } else if (action === 'deduct') {
    if (num > user.balance) return res.status(400).json({ error: 'Deduct amount exceeds user balance' });
    user.balance -= num;
    transactions.unshift({
      id: Date.now(),
      userId: user.id,
      type: `Admin Debit (${reason || 'Manual Adjustment'})`,
      amount: -num,
      status: 'Completed',
      timestamp: new Date().toISOString()
    });
    logAudit('Balance Debited', `Admin deducted ₹ ${num} from ${user.name} (${user.id})`, req);
  } else {
    return res.status(400).json({ error: 'Invalid action (add or deduct required)' });
  }

  res.json({ success: true, newBalance: user.balance, user });
});

// TOGGLE USER STATUS (ACTIVE / FROZEN)
app.post('/api/admin/users/toggle-status', (req, res) => {
  const { userId } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.status = user.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
  logAudit('User Status Toggled', `Admin set ${user.name} (${user.id}) status to ${user.status}`, req);
  res.json({ success: true, status: user.status, user });
});

app.delete('/api/admin/users/:id', (req, res) => {
  const id = req.params.id;
  const index = users.findIndex(u => u.id === id);
  if (index === -1) return res.status(404).json({ error: 'User not found' });

  const deleted = users.splice(index, 1)[0];
  logAudit('User Deleted', `Admin deleted user ${deleted.name} (${deleted.id})`, req);
  res.json({ success: true, deleted });
});

// COMBINED ADMIN ORDERS GET ROUTE (DEPOSITS & SELLS)
app.get('/api/admin/orders', (req, res) => {
  const allOrders = [...depositBuyOrders, ...sellOrders];
  allOrders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(allOrders);
});

// ADMIN CREATE MANUAL ORDER
app.post('/api/admin/orders/create', (req, res) => {
  const { userId, orderType, amount, status, payoutBank, accountNumber } = req.body;
  const num = Number(amount);
  if (!userId || !num || num <= 0) return res.status(400).json({ error: 'UserId and Amount required' });

  const user = users.find(u => u.id === userId) || { name: 'System User', id: userId };
  const newOrder = {
    id: Math.floor(800000 + Math.random() * 200000),
    userId: user.id,
    userName: user.name,
    orderType: orderType || 'Deposit',
    amount: num,
    usdtAmount: Number((num / statsData.exchangeRate).toFixed(2)),
    status: status || 'Success',
    paymentChannel: payoutBank || 'Admin Direct',
    timestamp: new Date().toISOString()
  };

  if (orderType === 'Deposit') {
    depositBuyOrders.unshift(newOrder);
    if (newOrder.status === 'Success' && user.balance !== undefined) {
      user.balance += num;
      user.deposit += num;
    }
  } else {
    sellOrders.unshift(newOrder);
    if (newOrder.status === 'Success' && user.balance !== undefined) {
      user.withdrawal += num;
      if (user.balance >= num) user.balance -= num;
    }
  }

  logAudit('Order Created', `Admin created ${orderType} order #${newOrder.id} for ₹ ${num}`, req);
  res.status(201).json(newOrder);
});

// ADMIN DELETE ORDER
app.delete('/api/admin/orders/:id', (req, res) => {
  const id = Number(req.params.id);
  let index = depositBuyOrders.findIndex(o => o.id === id);
  if (index !== -1) {
    const deleted = depositBuyOrders.splice(index, 1)[0];
    logAudit('Order Deleted', `Admin deleted Deposit order #${id}`, req);
    return res.json({ success: true, deleted });
  }

  index = sellOrders.findIndex(o => o.id === id);
  if (index !== -1) {
    const deleted = sellOrders.splice(index, 1)[0];
    logAudit('Order Deleted', `Admin deleted Sell order #${id}`, req);
    return res.json({ success: true, deleted });
  }

  res.status(404).json({ error: 'Order not found' });
});

// ADMIN UPDATE STATUS ROUTE FOR BOTH DEPOSIT & SELL ORDERS
app.post('/api/admin/orders/update-status', (req, res) => {
  const { orderId, orderType, newStatus } = req.body;
  const id = Number(orderId);

  let targetOrder = null;
  if (orderType === 'Deposit') {
    targetOrder = depositBuyOrders.find(o => o.id === id);
  } else {
    targetOrder = sellOrders.find(o => o.id === id);
  }

  if (!targetOrder) return res.status(404).json({ error: 'Order not found' });

  const prevStatus = targetOrder.status;
  targetOrder.status = newStatus;
  const user = users.find(u => u.id === targetOrder.userId);

  if (user && prevStatus !== 'Success') {
    if (newStatus === 'Success') {
      if (orderType === 'Deposit') {
        user.balance += targetOrder.amount;
        user.deposit += targetOrder.amount;
      } else {
        user.withdrawal += targetOrder.amount;
        if (user.balance >= targetOrder.amount) {
          user.balance -= targetOrder.amount;
        }
      }
    }
  }

  logAudit('Order Status Changed', `Admin set ${orderType} order #${id} status to "${newStatus}"`, req);
  res.json({ success: true, order: targetOrder });
});

// ADMIN BROADCAST / TARGETED NOTIFICATIONS
app.post('/api/admin/notifications/broadcast', (req, res) => {
  const { title, body, type, targetUserId } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body required' });

  const newNotif = {
    id: Date.now(),
    title: title.trim(),
    body: body.trim(),
    type: type || 'Broadcast',
    targetUserId: targetUserId || 'ALL',
    isRead: false,
    time: 'Just now'
  };

  notifications.unshift(newNotif);
  logAudit('Notification Broadcasted', `Title: ${title} (Target: ${targetUserId || 'ALL'})`, req);
  res.status(201).json({ success: true, notification: newNotif });
});

// ADMIN GET ALL USER PAYMENT TOOLS / WALLETS
app.get('/api/admin/wallets', (req, res) => {
  res.json(userWallets);
});

// ADMIN ADD USER PAYMENT TOOL / WALLET
app.post('/api/admin/wallets/add', (req, res) => {
  const { userId, walletName, walletAddress, walletType, holderName } = req.body;
  if (!walletAddress) return res.status(400).json({ error: 'Account or wallet address required' });

  const targetUser = users.find(u => u.id === userId);
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
  userWallets.unshift(newWallet);
  logAudit('Admin Added Wallet', `Admin added ${walletName} (${walletAddress}) for user ${newWallet.userId}`, req);
  res.status(201).json({ success: true, wallet: newWallet });
});

app.post('/api/admin/offers', (req, res) => {
  const { amount, code, income, specialBonus, category } = req.body;
  if (!amount || !code) return res.status(400).json({ error: 'Amount and Code required' });

  const newOffer = {
    id: Date.now(),
    amount: Number(amount),
    code: code.trim(),
    income: Number(income) || 20.00,
    specialBonus: Number(specialBonus) || 3.00,
    category: category || '100-300'
  };
  paymentOffers.unshift(newOffer);
  logAudit('Offer Added', `Admin added claim offer ${newOffer.code}`, req);
  res.status(201).json(newOffer);
});

app.delete('/api/admin/offers/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = paymentOffers.findIndex(o => o.id === id);
  if (index === -1) return res.status(404).json({ error: 'Offer not found' });

  const deleted = paymentOffers.splice(index, 1)[0];
  logAudit('Offer Deleted', `Admin deleted offer ${deleted.code}`, req);
  res.json({ success: true, deleted });
});

app.post('/api/admin/settings', (req, res) => {
  const { exchangeRate, scoreRate, commissionRate, specialRewardActive, maintenanceMode, isSellingOpen, appVersion, adminUpiId, merchantName } = req.body;

  if (typeof exchangeRate === 'number') statsData.exchangeRate = exchangeRate;
  if (typeof scoreRate === 'number') statsData.scoreRate = scoreRate;
  if (typeof commissionRate === 'number') statsData.commissionRate = commissionRate;
  if (typeof specialRewardActive === 'boolean') statsData.specialRewardActive = specialRewardActive;
  if (typeof maintenanceMode === 'boolean') statsData.maintenanceMode = maintenanceMode;
  if (typeof isSellingOpen === 'boolean') statsData.isSellingOpen = isSellingOpen;
  if (appVersion) statsData.appVersion = appVersion;
  if (adminUpiId) statsData.adminUpiId = adminUpiId.trim();
  if (merchantName) statsData.merchantName = merchantName.trim();

  logAudit('Settings Updated', 'Admin updated platform rates & merchant UPI settings', req);
  res.json({ success: true, statsData });
});

app.get('/api/admin/logs', (req, res) => res.json(auditLogs.slice(0, 50)));


// SPA Catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

// Listen on 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`\n======================================================`);
  console.log(`🚀 MASTER FINTECH PLATFORM, SELL ORDERS & ADMIN ENGINE RUNNING!`);
  console.log(`📱 Mobile Web App Access:  http://${localIp}:${PORT}`);
  console.log(`💻 Dedicated PC Admin Dashboard: http://localhost:${PORT}/admin`);
  console.log(`======================================================\n`);
});

