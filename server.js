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
let users = [
  {
    id: '310422',
    name: 'Rajju',
    phone: '9876543210',
    password: '123',
    balance: 5000.00,
    deposit: 3000.00,
    withdrawal: 1000.00,
    commission: 500.00,
    scorePoints: 1250,
    sellTotal: 0.00,
    cashbackReward: 0,
    cashbackPending: 0,
    status: 'ACTIVE',
    createdAt: '2026-07-26'
  },
  {
    id: '512093',
    name: 'Vikram Singh',
    phone: '9812345678',
    password: '123',
    balance: 2500.00,
    deposit: 2000.00,
    withdrawal: 0.00,
    commission: 500.00,
    scorePoints: 3400,
    sellTotal: 0.00,
    cashbackReward: 50,
    cashbackPending: 0,
    status: 'ACTIVE',
    createdAt: '2026-07-25'
  },
  {
    id: '784102',
    name: 'Priya Sharma',
    phone: '9765432109',
    password: '123',
    balance: 1200.00,
    deposit: 1000.00,
    withdrawal: 0.00,
    commission: 200.00,
    scorePoints: 850,
    sellTotal: 0.00,
    cashbackReward: 20,
    cashbackPending: 0,
    status: 'ACTIVE',
    createdAt: '2026-07-24'
  }
];

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

let notifications = [
  {
    id: 1,
    title: 'Welcome Special Bonus!',
    body: 'Your account is active. Complete daily claim tasks to earn 4% cashback!',
    type: 'Reward',
    isRead: false,
    time: 'Just now'
  },
  {
    id: 2,
    title: 'USDT Rate Update',
    body: 'Real-time exchange rate updated to 110 INR/USDT. Start selling now!',
    type: 'Info',
    isRead: false,
    time: '10 mins ago'
  }
];

let paymentOffers = [
  { id: 1, amount: 611, code: 'EWLReL', income: 24.44, specialBonus: 3.00, category: '100-300' },
  { id: 2, amount: 653, code: '8g9gfd', income: 26.12, specialBonus: 3.00, category: '301-500' },
  { id: 3, amount: 890, code: 'K9L2xP', income: 35.60, specialBonus: 5.00, category: '501-1000' },
  { id: 4, amount: 1250, code: 'M4N7vQ', income: 50.00, specialBonus: 8.00, category: '501-1000' }
];

let userWallets = [];

// DEPOSIT BUY ORDERS SAMPLE DATA
let depositBuyOrders = [
  {
    id: 891021,
    userId: '310422',
    userName: 'Rajju',
    orderType: 'Deposit',
    amount: 1100,
    usdtAmount: 10,
    status: 'Processing',
    paymentChannel: 'Paytm Wallet',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 891018,
    userId: '310422',
    userName: 'Rajju',
    orderType: 'Deposit',
    amount: 550,
    usdtAmount: 5,
    status: 'Submit',
    paymentChannel: 'Freecharge Wallet',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 890850,
    userId: '310422',
    userName: 'Rajju',
    orderType: 'Deposit',
    amount: 2200,
    usdtAmount: 20,
    status: 'Success',
    paymentChannel: 'Mobikwik Wallet',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 889201,
    userId: '310422',
    userName: 'Rajju',
    orderType: 'Deposit',
    amount: 4400,
    usdtAmount: 40,
    status: 'Close',
    paymentChannel: 'Bank Transfer',
    timestamp: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
  }
];

// SELL ORDERS (WITHDRAWALS) SAMPLE DATA WITH VARIOUS STATUSES
let sellOrders = [
  {
    id: 991001,
    userId: '310422',
    userName: 'Rajju',
    orderType: 'Sell',
    amount: 500,
    usdtAmount: 4.54,
    status: 'Pending', // Pending status
    payoutBank: 'State Bank of India (SBI)',
    accountNumber: '****3892',
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // 1 hour ago
  },
  {
    id: 990982,
    userId: '310422',
    userName: 'Rajju',
    orderType: 'Sell',
    amount: 1200,
    usdtAmount: 10.90,
    status: 'Submitted', // Submitted status
    payoutBank: 'HDFC Bank',
    accountNumber: '****7120',
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() // 12 hours ago
  },
  {
    id: 990710,
    userId: '310422',
    userName: 'Rajju',
    orderType: 'Sell',
    amount: 2500,
    usdtAmount: 22.72,
    status: 'Success', // Success status
    payoutBank: 'ICICI Bank',
    accountNumber: '****9012',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
  },
  {
    id: 989800,
    userId: '310422',
    userName: 'Rajju',
    orderType: 'Sell',
    amount: 800,
    usdtAmount: 7.27,
    status: 'Timeout', // Timeout status
    payoutBank: 'Paytm Payments Bank',
    accountNumber: '****4411',
    timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago
  }
];

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
  const userId = req.query.userId || '310422';
  const orders = depositBuyOrders.filter(o => o.userId === userId || userId === '310422');
  res.json(orders);
});

// SELL ORDERS API
app.get('/api/user/sell-orders', (req, res) => {
  const userId = req.query.userId || '310422';
  const orders = sellOrders.filter(o => o.userId === userId || userId === '310422');
  res.json(orders);
});

// SCORE CONVERSION API
app.post('/api/user/convert-score', (req, res) => {
  const { userId, points } = req.body;
  const numPoints = Number(points);

  if (!numPoints || numPoints < 100) {
    return res.status(400).json({ error: 'Minimum score conversion is 100 points' });
  }

  const targetUser = users.find(u => u.id === (userId || '310422')) || users[0];

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
    referralCode: referralCode || '310422',
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
  const userId = req.query.id || '310422';
  const user = users.find(u => u.id === userId) || users[0];
  res.json(user);
});

app.post('/api/user/topup', (req, res) => {
  const { amount, userId, paymentChannel, utrNumber } = req.body;
  const num = Number(amount);
  if (!num || num <= 0) return res.status(400).json({ error: 'Invalid top-up amount' });

  const targetUser = users.find(u => u.id === (userId || '310422')) || users[0];

  const newOrder = {
    id: Math.floor(800000 + Math.random() * 100000),
    userId: targetUser.id,
    userName: targetUser.name,
    orderType: 'Deposit',
    amount: num,
    usdtAmount: Math.round(num / statsData.exchangeRate),
    status: 'Submitted',
    paymentChannel: paymentChannel || 'UPI Direct',
    utrNumber: utrNumber || 'Pending UTR',
    timestamp: new Date().toISOString()
  };

  depositBuyOrders.unshift(newOrder);
  logAudit('Top-up Deposit Submitted', `User ${targetUser.name} submitted deposit ₹ ${num} (UTR: ${newOrder.utrNumber})`, req);
  res.json({ success: true, message: `Deposit Order #${newOrder.id} created & pending Admin verification!`, order: newOrder });
});

app.post('/api/user/withdraw', (req, res) => {
  const { amount, userId, payoutBank, accountNumber } = req.body;
  const num = Number(amount);
  const targetUser = users.find(u => u.id === (userId || '310422')) || users[0];

  if (!num || num <= 0) return res.status(400).json({ error: 'Invalid withdrawal amount' });
  if (num > targetUser.balance) return res.status(400).json({ error: 'Insufficient wallet balance' });

  const newOrder = {
    id: Math.floor(900000 + Math.random() * 100000),
    userId: targetUser.id,
    userName: targetUser.name,
    orderType: 'Sell',
    amount: num,
    usdtAmount: Number((num / statsData.exchangeRate).toFixed(2)),
    status: 'Pending', // Initial status
    payoutBank: payoutBank || 'Bank Transfer',
    accountNumber: accountNumber || '****9900',
    timestamp: new Date().toISOString()
  };

  sellOrders.unshift(newOrder);
  res.json({ success: true, message: 'Sell Order submitted & pending Admin processing!', order: newOrder });
});

app.get('/api/user/orders', (req, res) => {
  const userId = req.query.id || '310422';
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

  const targetUser = users.find(u => u.id === (userId || '310422')) || users[0];
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

  const targetUser = users.find(u => u.id === userId) || users[0];
  const newWallet = {
    id: Date.now(),
    userId: targetUser ? targetUser.id : (userId || '310422'),
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

