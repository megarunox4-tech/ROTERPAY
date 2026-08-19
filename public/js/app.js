/* ==========================================================================
   MASTER FINTECH PLATFORM - APP, SCORE, DEPOSIT & SELL ORDERS CONTROLLER
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  FintechApp.init();
});

const FintechApp = {
  state: {
    activeAppTab: 'home',
    currentUser: null,
    authToken: null,
    stats: null,
    offers: [],
    wallets: [],
    tasks: [],
    notifications: [],
    depositOrders: [],
    sellOrders: [],
    depDateFilter: 'ALL',
    depStatusFilter: 'ALL',
    sellStatusFilter: 'ALL',
    depOrderBy: 'NEWEST',
    sellOrderBy: 'NEWEST',
    paymentOrderBy: 'NEWEST',
    unreadCount: 0,
    notifFilter: 'ALL',
    filterCategory: 'ALL',
    selectedChain: 'TRC20',
    taskCategoryFilter: 'NEWBIE',
    activeToolSegment: 'Personal',
    selectedToolOption: 'Freecharge',
    paymentToolsCatalog: {
      Personal: [
        { id: 'freecharge', name: 'Freecharge', iconClass: 'bg-freecharge', iconText: 'F', payout: true, sub: '' },
        { id: 'mobikwik', name: 'Mobikwik', iconClass: 'bg-mobikwik', iconText: 'M', payout: true, sub: 'Payin 10.00 - 100000.00' },
        { id: 'paytm', name: 'Paytm', iconClass: 'bg-paytm', iconText: 'P', payout: true, sub: 'Payin 10.00 - 100000.00' },
        { id: 'induspay', name: 'IndusPay', iconClass: 'bg-induspay', iconText: 'IP', payout: false, sub: 'Payin 10.00 - 100000.00' },
        { id: 'bharatpebiz', name: 'BharatpeBiz', iconClass: 'bg-bharatpe', iconText: 'B', payout: false, sub: 'Payin 300.00 - 10000.00' }
      ],
      Business: [
        { id: 'paytm_biz', name: 'Paytm Business', iconClass: 'bg-paytm', iconText: 'P', payout: true, sub: 'Payin 100.00 - 500000.00' },
        { id: 'bharatpe_biz', name: 'Bharatpe Merchant', iconClass: 'bg-bharatpe', iconText: 'B', payout: true, sub: 'Payin 500.00 - 1000000.00' },
        { id: 'phonepe_biz', name: 'PhonePe Business', iconClass: 'bg-phonepe', iconText: 'P', payout: true, sub: 'Payin 200.00 - 500000.00' },
        { id: 'gpay_biz', name: 'GooglePay Merchant', iconClass: 'bg-gpay', iconText: 'G', payout: false, sub: 'Payin 500.00 - 1000000.00' }
      ]
    },
    taskItemsList: [
      { id: 't1', category: 'NEWBIE', title: 'New Member Tasks', desc: 'Register and start trading. Once your total trading amount reaches 20000.', tokens: 178, current: 0, max: 20000, status: 'NOT_STARTED', actionText: 'Not Started' },
      { id: 't2', category: 'NEWBIE', title: 'Bind Wallet Type Paytm Business Reward', desc: 'You can get rewards by binding your Paytm Business wallet.', tokens: 49, current: 0, max: 1, status: 'GO_TO_BIND', actionText: 'Go to Bind' },
      { id: 't3', category: 'TEAM', title: 'Invite 3 Active Friends', desc: 'Invite 3 direct friends to register and start trading.', tokens: 120, current: 1, max: 3, status: 'INVITE', actionText: 'Invite Now' },
      { id: 't4', category: 'TEAM', title: 'Team Trading Volume 50000', desc: 'Earn team commission bonuses once team trading reaches 50000.', tokens: 350, current: 5000, max: 50000, status: 'NOT_STARTED', actionText: 'Not Started' },
      { id: 't5', category: 'DAILY', title: 'Daily Login Reward', desc: 'Log in to the app daily to claim free reward tokens.', tokens: 25, current: 1, max: 1, status: 'CLAIMABLE', actionText: 'Claim Reward' },
      { id: 't6', category: 'DAILY', title: 'Complete 1 Order Claim Today', desc: 'Claim any payment cashback offer today.', tokens: 50, current: 0, max: 1, status: 'GO_TO_CLAIM', actionText: 'Go to Claim' }
    ]
  },

  async init() {
    this.initPwa();
    this.bindAppNavigation();
    this.bindAppEvents();
    await this.restoreSession();
    
    // Restore exact active tab on F5 page refresh
    const savedTab = localStorage.getItem('fintech_active_tab');
    if (savedTab && document.getElementById(`tab-${savedTab}`)) {
      this.switchAppTab(savedTab);
    } else {
      this.switchAppTab('home');
    }

    await this.loadAllAppData();
    // Real-time live background sync (every 2 seconds) so any change in Admin instantly updates website!
    setInterval(() => this.pollLiveUpdates(), 2000);
  },

  async pollLiveUpdates() {
    try {
      if (!this.state.currentUser) return;
      const activeId = this.state.currentUser.id;
      const [uRes, sRes, oRes, nRes] = await Promise.all([
        fetch(`/api/user?id=${activeId}`),
        fetch('/api/stats'),
        fetch(`/api/user/orders?id=${activeId}`),
        fetch('/api/notifications')
      ]);

      if (uRes.ok) {
        const user = await uRes.json();
        this.state.currentUser = user;

        if (document.getElementById('userName')) document.getElementById('userName').textContent = user.name;
        if (document.getElementById('userId')) document.getElementById('userId').textContent = user.id;

        if (document.getElementById('homeBalance')) document.getElementById('homeBalance').textContent = user.balance.toFixed(2);
        if (document.getElementById('homeDeposit')) document.getElementById('homeDeposit').textContent = user.deposit.toFixed(2);
        if (document.getElementById('homeWithdrawal')) document.getElementById('homeWithdrawal').textContent = user.withdrawal.toFixed(2);

        if (document.getElementById('userScoreDisplay')) document.getElementById('userScoreDisplay').textContent = (user.scorePoints || 0).toLocaleString();
        if (document.getElementById('scoreBalVal')) document.getElementById('scoreBalVal').textContent = user.balance.toFixed(2);
        if (document.getElementById('scoreDepVal')) document.getElementById('scoreDepVal').textContent = user.deposit.toFixed(2);
        if (document.getElementById('scoreWithVal')) document.getElementById('scoreWithVal').textContent = user.withdrawal.toFixed(2);
        if (document.getElementById('scoreCommVal')) document.getElementById('scoreCommVal').textContent = user.commission.toFixed(2);

        if (document.getElementById('paymentBalance')) document.getElementById('paymentBalance').textContent = user.balance.toFixed(0);
        if (document.getElementById('paymentReward')) document.getElementById('paymentReward').textContent = user.cashbackReward || 0;
        if (document.getElementById('paymentPending')) document.getElementById('paymentPending').textContent = user.cashbackPending || 0;

        if (document.getElementById('statBalance')) document.getElementById('statBalance').textContent = user.balance.toFixed(2);
        if (document.getElementById('statSell')) document.getElementById('statSell').textContent = (user.sellTotal || 0).toFixed(2);
        if (document.getElementById('statDeposit')) document.getElementById('statDeposit').textContent = user.deposit.toFixed(2);
        if (document.getElementById('statCommission')) document.getElementById('statCommission').textContent = user.commission.toFixed(2);

        if (document.getElementById('teamTotalCommDisplay')) document.getElementById('teamTotalCommDisplay').textContent = user.commission.toFixed(2);
        if (document.getElementById('teamDepTotal')) document.getElementById('teamDepTotal').textContent = user.deposit.toFixed(2);
      } else if (uRes.status === 404) {
        this.logout();
        return;
      }

      if (sRes.ok) {
        const stats = await sRes.json();
        this.state.stats = stats;

        const maintOverlay = document.getElementById('maintenanceOverlay');
        if (maintOverlay) {
          maintOverlay.style.display = stats.maintenanceMode ? 'flex' : 'none';
        }

        if (document.getElementById('quickUsdtRate')) document.getElementById('quickUsdtRate').textContent = `${stats.exchangeRate}INR`;
        if (document.getElementById('scoreRateBadge')) document.getElementById('scoreRateBadge').textContent = `100 Score = ₹ ${stats.scoreRate || 10} INR`;
        if (document.getElementById('statExchangeRate')) document.getElementById('statExchangeRate').textContent = stats.exchangeRate;
        if (document.getElementById('statCommissionRate')) document.getElementById('statCommissionRate').textContent = stats.commissionRate.toFixed(2);

        const btnSell = document.getElementById('btnToggleSelling');
        if (btnSell) {
          if (stats.isSellingOpen) {
            btnSell.textContent = 'Selling Active (Open)';
            btnSell.style.background = '#ff6600';
          } else {
            btnSell.textContent = 'Closed Selling';
            btnSell.style.background = '#f59e0b';
          }
        }
      }

      if (oRes.ok) {
        const orders = await oRes.json();
        this.state.depositOrders = orders.filter(o => o.orderType === 'Deposit');
        this.state.sellOrders = orders.filter(o => o.orderType === 'Sell');
        this.renderHomeTransactions();
        if (this.state.activeAppTab === 'deposit-orders') this.renderDepositBuyOrders();
        if (this.state.activeAppTab === 'sell-orders') this.renderSellOrders();
      }

      // Sync support chat stream in real-time when on support page
      if (this.state.activeAppTab === 'support') {
        this.loadSupportMessages();
      }

      if (nRes.ok) {
        const nData = await nRes.json();
        this.state.notifications = nData.notifications;
        const badge = document.getElementById('bellUnreadBadge');
        if (badge) {
          if (nData.unreadCount > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = nData.unreadCount;
          } else {
            badge.style.display = 'none';
          }
        }
      }
    } catch (e) {
      console.warn('Poll update skipped:', e);
    }
  },

  // TEAM MANAGEMENT CONTROLLER
  openTeamView() {
    this.switchAppTab('team-statistics');
    this.loadTeamStatistics();
  },

  loadTeamStatistics() {
    const user = this.state.currentUser || { id: '-', commission: 0.00, deposit: 0.00 };
    document.getElementById('teamTotalCommDisplay').textContent = user.commission.toFixed(2);
    document.getElementById('teamInviteCode').textContent = user.id;
    document.getElementById('teamDepTotal').textContent = user.deposit.toFixed(2);
  },

  copyInviteLink() {
    const code = this.state.currentUser ? this.state.currentUser.id : '';
    if (!code) return this.showToast('Please sign in first', 'danger');
    const origin = window.location.origin || `http://${window.location.hostname}:3000`;
    const link = `${origin}/register?ref=${code}`;
    navigator.clipboard.writeText(link);
    this.showToast(`Invitation Link copied: ${link}`, 'success');
  },

  shareAppTo(platform) {
    const code = this.state.currentUser ? this.state.currentUser.id : '';
    if (!code) return this.showToast('Please sign in first', 'danger');
    const origin = window.location.origin || `http://${window.location.hostname}:3000`;
    const link = `${origin}/register?ref=${code}`;
    const text = encodeURIComponent(`Join Fintech Hub with my referral link: ${link}`);

    if (platform === 'telegram') window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${text}`, '_blank');
    else if (platform === 'facebook') window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank');
    else if (platform === 'whatsapp') window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  },

  filterTeamPerf(period) {
    document.getElementById('perfChipDay')?.classList.toggle('active', period === 'Day');
    document.getElementById('perfChipWeek')?.classList.toggle('active', period === 'Week');
    document.getElementById('perfChipMonth')?.classList.toggle('active', period === 'Month');

    const bars = document.getElementById('perfGraphicBars');
    if (!bars) return;

    if (period === 'Day') {
      bars.innerHTML = `
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 15%;"></div><span class="perf-bar-label">6AM</span></div>
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 35%;"></div><span class="perf-bar-label">12PM</span></div>
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 70%;"></div><span class="perf-bar-label">6PM</span></div>
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 50%;"></div><span class="perf-bar-label">12AM</span></div>
      `;
    } else if (period === 'Week') {
      bars.innerHTML = `
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 30%;"></div><span class="perf-bar-label">Mon</span></div>
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 55%;"></div><span class="perf-bar-label">Wed</span></div>
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 90%;"></div><span class="perf-bar-label">Fri</span></div>
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 75%;"></div><span class="perf-bar-label">Sun</span></div>
      `;
    } else {
      bars.innerHTML = `
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 20%;"></div><span class="perf-bar-label">W1</span></div>
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 45%;"></div><span class="perf-bar-label">W2</span></div>
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 80%;"></div><span class="perf-bar-label">W3</span></div>
        <div class="perf-bar-col"><div class="perf-bar-fill" style="height: 60%;"></div><span class="perf-bar-label">W4</span></div>
      `;
    }
  },

  // TASK REWARDS CONTROLLER (MATCHING SCREENSHOT IN ORANGE + WHITE)
  openTaskRewardsView() {
    this.switchAppTab('task-rewards');
    this.renderTaskRewards();
  },

  filterTaskCategory(cat) {
    this.state.taskCategoryFilter = cat;
    document.getElementById('taskTabNewbie')?.classList.toggle('active', cat === 'NEWBIE');
    document.getElementById('taskTabTeam')?.classList.toggle('active', cat === 'TEAM');
    document.getElementById('taskTabDaily')?.classList.toggle('active', cat === 'DAILY');
    this.renderTaskRewards();
  },

  renderTaskRewards() {
    const container = document.getElementById('taskRewardsListContainer');
    if (!container) return;

    const filtered = this.state.taskItemsList.filter(t => t.category === this.state.taskCategoryFilter);

    if (filtered.length === 0) {
      container.innerHTML = `<div class="card text-center text-muted" style="padding: 2rem;">No tasks available in this category.</div>`;
      return;
    }

    container.innerHTML = filtered.map(t => {
      const progressPercent = Math.min(100, (t.current / t.max) * 100);
      
      let btnClass = 'btn-task-not-started';
      if (t.status === 'GO_TO_BIND' || t.status === 'GO_TO_CLAIM' || t.status === 'INVITE') btnClass = 'btn-task-go-bind';
      if (t.status === 'CLAIMABLE') btnClass = 'btn-task-claim';
      if (t.status === 'COMPLETED') btnClass = 'btn-task-completed';

      return `
        <div class="task-card-orange">
          <div class="task-card-header">
            <div class="task-cat-badge">
              <span class="task-cat-dot"></span>
              <span>${t.category}</span>
            </div>
            <div class="task-progress-wrap">
              <div class="task-progress-bar-bg">
                <div class="task-progress-bar-fill" style="width: ${progressPercent}%;"></div>
              </div>
              <span class="task-progress-text">${t.current} / ${t.max}</span>
            </div>
          </div>

          <h3 class="task-card-title">${t.title}</h3>
          <p class="task-card-desc">${t.desc}</p>

          <div class="task-card-footer">
            <div class="token-reward-pill">
              <div class="token-star-icon"><i class="fa-solid fa-star"></i></div>
              <span>${t.tokens}</span>
            </div>
            <button class="btn-task-action-pill ${btnClass}" onclick="FintechApp.handleTaskAction('${t.id}')">${t.actionText}</button>
          </div>
        </div>
      `;
    }).join('');
  },

  handleTaskAction(taskId) {
    const task = this.state.taskItemsList.find(t => t.id === taskId);
    if (!task) return;

    if (task.status === 'GO_TO_BIND') {
      this.switchAppTab('tool');
      this.showToast('Please add a wallet to complete this task', 'info');
    } else if (task.status === 'GO_TO_CLAIM') {
      this.switchAppTab('payment');
      this.showToast('Claim any cashback offer to complete task', 'info');
    } else if (task.status === 'INVITE') {
      document.getElementById('modalTeamCenter')?.classList.add('active');
    } else if (task.status === 'CLAIMABLE') {
      task.status = 'COMPLETED';
      task.actionText = 'Completed';
      
      if (this.state.currentUser) {
        this.state.currentUser.scorePoints = (this.state.currentUser.scorePoints || 0) + task.tokens;
      }

      this.showToast(`Claimed +${task.tokens} Token Reward Points!`, 'success');
      this.renderTaskRewards();
      this.loadUser();
    } else if (task.status === 'NOT_STARTED') {
      this.showToast('Task not started yet. Complete prerequisites first.', 'info');
    } else if (task.status === 'COMPLETED') {
      this.showToast('Task reward already completed & claimed!', 'success');
    }
  },

  // USDT DEPOSIT CALCULATOR CONTROLLER (MATCHING SCREENSHOT IN ORANGE + WHITE)
  openDepositOrdersView() {
    this.openUsdtDepositView();
  },

  openUsdtDepositView() {
    this.switchAppTab('usdt-deposit');
    this.calcUsdtReceive();
  },

  calcUsdtReceive() {
    const inputVal = Number(document.getElementById('usdtCalcInput').value) || 0;
    const rate = this.state.stats?.exchangeRate || 110;
    const totalScore = (inputVal * rate).toFixed(2);
    
    document.getElementById('usdtRatioLabel').textContent = `Ratio: 1 USDT=${rate} INR`;
    document.getElementById('usdtReceivePreview').textContent = `${totalScore} Score`;
    document.getElementById('usdtBonusPreview').textContent = `${(inputVal * 0.05).toFixed(2)} Score`;
  },

  openScoreDetailView() {
    const user = this.state.currentUser || { balance: 0, deposit: 0, withdrawal: 0, commission: 0 };
    if (document.getElementById('mdlBal')) document.getElementById('mdlBal').textContent = (user.balance || 0).toFixed(2);
    if (document.getElementById('mdlDep')) document.getElementById('mdlDep').textContent = (user.deposit || 0).toFixed(2);
    if (document.getElementById('mdlWith')) document.getElementById('mdlWith').textContent = (user.withdrawal || 0).toFixed(2);
    if (document.getElementById('mdlComm')) document.getElementById('mdlComm').textContent = (user.commission || 0).toFixed(2);
    document.getElementById('modalBalanceDetail')?.classList.add('active');
  },

  selectFixedUsdt(val, btn) {
    document.querySelectorAll('.btn-preset-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const input = document.getElementById('usdtCalcInput');
    if (input) {
      input.value = val;
      this.calcUsdtReceive();
    }
  },

  selectChainType(chain) {
    this.state.selectedChain = chain;
    document.getElementById('chainCardTRC20')?.classList.toggle('selected', chain === 'TRC20');
    document.getElementById('chainCardBSC')?.classList.toggle('selected', chain === 'BSC');
  },

  async handleUsdtDepositSubmit() {
    const amountUsdt = Number(document.getElementById('usdtCalcInput')?.value || 1);
    if (!amountUsdt || amountUsdt <= 0) return this.showToast('Please enter a valid USDT amount', 'danger');

    const rate = this.state.stats?.exchangeRate || 110;
    const amountInr = amountUsdt * rate;
    const userId = this.state.currentUser ? this.state.currentUser.id : '';
    if (!userId) return this.showToast('Please sign in first', 'danger');

    // Route directly to the Deposit Payment & Dynamic UPI QR Code Screen!
    await this.handleCreateDepositOrder(null, amountInr);
  },

  copyOrderField(elementId, label) {
    const text = document.getElementById(elementId)?.textContent || '';
    if (text) {
      navigator.clipboard.writeText(text);
      this.showToast(`${label} copied to clipboard!`, 'success');
    }
  },

  showAuthOverlay() {
    const overlay = document.getElementById('userAuthOverlay');
    if (overlay) overlay.classList.add('active');
    this.showLogin();
  },

  closeAuth() {
    const overlay = document.getElementById('userAuthOverlay');
    if (overlay) overlay.classList.remove('active');
  },

  showLogin() {
    const loginCard = document.getElementById('cardUserLogin');
    const regCard = document.getElementById('cardUserRegister');
    if (loginCard) loginCard.style.display = 'block';
    if (regCard) regCard.style.display = 'none';
  },

  showRegister() {
    const loginCard = document.getElementById('cardUserLogin');
    const regCard = document.getElementById('cardUserRegister');
    if (loginCard) loginCard.style.display = 'none';
    if (regCard) regCard.style.display = 'block';
  },

  togglePassVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  },

  handleLogout() {
    this.state.authToken = null;
    this.state.currentUser = null;
    localStorage.removeItem('fintech_user_token');
    localStorage.removeItem('fintech_user_data');
    if (document.getElementById('userName')) document.getElementById('userName').textContent = 'Not Logged In';
    if (document.getElementById('userId')) document.getElementById('userId').textContent = '-';
    this.showToast('Logged out successfully', 'info');
    this.showAuthOverlay();
  },

  async handleLogin(e) {
    if (e) e.preventDefault();
    const loginInput = document.getElementById('loginInputStr').value;
    const password = document.getElementById('loginPasswordStr').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginInput, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.state.authToken = data.token;
      this.state.currentUser = data.user;
      localStorage.setItem('fintech_user_token', data.token);
      localStorage.setItem('fintech_user_data', JSON.stringify(data.user));

      this.closeAuth();
      this.showToast(`Signed in as ${data.user.name}!`, 'success');
      await this.loadAllAppData();
    } catch (err) {
      this.showToast(err.message, 'danger');
    }
  },

  async handleRegister(e) {
    if (e) e.preventDefault();
    const name = document.getElementById('regName').value;
    const phone = document.getElementById('regPhone').value;
    const password = document.getElementById('regPassword').value;
    const referralCode = document.getElementById('regReferral').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, password, referralCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.state.authToken = data.token;
      this.state.currentUser = data.user;
      localStorage.setItem('fintech_user_token', data.token);
      localStorage.setItem('fintech_user_data', JSON.stringify(data.user));

      this.closeAuth();
      this.showToast(`Account created! User ID: ${data.user.id}`, 'success');
      await this.loadAllAppData();
    } catch (err) {
      this.showToast(err.message, 'danger');
    }
  },

  // SELL ORDERS CONTROLLER (WITHDRAWAL CLICK - STATUS FILTERS)
  async openSellOrdersView() {
    this.switchAppTab('sell-orders');
    await this.loadSellOrders();
  },

  async loadSellOrders() {
    const userId = this.state.currentUser ? this.state.currentUser.id : '';
    if (!userId) {
      this.state.sellOrders = [];
      this.renderSellOrders();
      return;
    }
    const res = await fetch(`/api/user/sell-orders?userId=${userId}`);
    const orders = await res.json();
    this.state.sellOrders = orders;
    this.renderSellOrders();
    this.renderHomeTransactions();
  },

  sortSellOrders(orderVal) {
    this.state.sellOrderBy = orderVal;
    this.renderSellOrders();
  },

  filterSellStatus(status) {
    this.state.sellStatusFilter = status;
    document.getElementById('chipSellStatusAll')?.classList.toggle('active', status === 'ALL');
    document.getElementById('chipSellStatusPending')?.classList.toggle('active', status === 'PENDING');
    document.getElementById('chipSellStatusSubmitted')?.classList.toggle('active', status === 'SUBMITTED');
    document.getElementById('chipSellStatusSuccess')?.classList.toggle('active', status === 'SUCCESS');
    document.getElementById('chipSellStatusTimeout')?.classList.toggle('active', status === 'TIMEOUT');
    this.renderSellOrders();
  },

  renderSellOrders() {
    const container = document.getElementById('sellOrdersListContainer');
    if (!container) return;

    let filtered = [...this.state.sellOrders];
    if (this.state.sellStatusFilter !== 'ALL') {
      filtered = filtered.filter(o => o.status.toUpperCase() === this.state.sellStatusFilter);
    }

    // Apply Order By sorting
    const orderVal = this.state.sellOrderBy || 'NEWEST';
    if (orderVal === 'NEWEST') {
      filtered.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    } else if (orderVal === 'OLDEST') {
      filtered.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    } else if (orderVal === 'AMOUNT_DESC') {
      filtered.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    } else if (orderVal === 'AMOUNT_ASC') {
      filtered.sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div class="card text-center text-muted" style="padding: 2rem;">No sell orders in ${this.state.sellStatusFilter} status.</div>`;
      return;
    }

    container.innerHTML = filtered.map(o => {
      let badgeClass = 'badge-pending';
      if (o.status === 'Submitted') badgeClass = 'badge-submit';
      if (o.status === 'Success') badgeClass = 'badge-success-green';
      if (o.status === 'Timeout') badgeClass = 'badge-timeout';

      return `
        <div class="card" style="margin-bottom: 12px; border-left: 4px solid var(--accent-blue);">
          <div class="flex-between">
            <strong class="text-blue" style="font-size:0.9rem;">#SELL-${o.id}</strong>
            <span class="status-badge-pill ${badgeClass}">${o.status}</span>
          </div>

          <div class="flex-between margin-top-1">
            <div>
              <span style="font-size:0.75rem; color:var(--text-muted);">Withdrawal Amount</span>
              <h4 style="font-family:var(--font-heading); font-size:1.3rem; font-weight:800; color:var(--text-dark);">₹ ${o.amount.toFixed(2)}</h4>
            </div>
            <div style="text-align: right;">
              <span style="font-size:0.75rem; color:var(--text-muted);">USDT Value</span>
              <h4 style="font-family:var(--font-heading); font-size:1.1rem; font-weight:800; color:var(--accent-blue);">${o.usdtAmount} USDT</h4>
            </div>
          </div>

          <div class="flex-between margin-top-1" style="font-size:0.75rem; color:var(--text-medium); border-top:1px solid var(--border-color); padding-top:8px;">
            <span><i class="fa-solid fa-building-columns text-blue"></i> ${o.payoutBank || 'Bank Transfer'} (${o.accountNumber || '****9900'})</span>
            <span><i class="fa-regular fa-clock"></i> ${new Date(o.timestamp).toLocaleString()}</span>
          </div>
          ${o.matchedNote ? `<div style="font-size:0.75rem; color:#15803d; background:#dcfce7; padding:4px 8px; border-radius:6px; margin-top:6px; font-weight:700;"><i class="fa-solid fa-bolt"></i> ${o.matchedNote}</div>` : ''}
        </div>
      `;
    }).join('');
  },

  selectFixedAmount(type, val, btn) {
    if (type === 'sell') {
      const input = document.getElementById('sellAmountInput');
      if (input) input.value = val;
      document.querySelectorAll('#formSellOrderCreate .btn-preset-chip').forEach(c => c.classList.remove('active'));
      if (btn) btn.classList.add('active');
    } else {
      const input = document.getElementById('depAmountInput');
      if (input) input.value = val;
      document.querySelectorAll('#formDepositBuyOrder .btn-preset-chip').forEach(c => c.classList.remove('active'));
      if (btn) btn.classList.add('active');
    }
  },

  async handleCreateSellOrder(e) {
    if (e) e.preventDefault();
    const amount = document.getElementById('sellAmountInput').value;
    const payoutBank = document.getElementById('sellBankInput').value;
    const accountNumber = document.getElementById('sellAccInput').value;
    const userId = this.state.currentUser ? this.state.currentUser.id : '';
    if (!userId) return this.showToast('Please sign in first', 'danger');

    try {
      const res = await fetch('/api/user/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, userId, payoutBank, accountNumber })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.showToast(data.message, 'success');
      document.getElementById('sellAmountInput').value = '';
      await this.loadSellOrders();
      await this.loadUser();
    } catch (err) {
      this.showToast(err.message, 'danger');
    }
  },

  // DEPOSIT BUY ORDERS CONTROLLER (DATE & STATUS FILTERS)
  async openDepositOrdersView() {
    this.switchAppTab('deposit-orders');
    await this.loadDepositBuyOrders();
  },

  async loadDepositBuyOrders() {
    const userId = this.state.currentUser ? this.state.currentUser.id : '';
    if (!userId) {
      this.state.depositOrders = [];
      this.renderDepositBuyOrders();
      return;
    }
    const res = await fetch(`/api/user/deposit-orders?userId=${userId}`);
    const orders = await res.json();
    this.state.depositOrders = orders;
    this.renderDepositBuyOrders();
    this.renderHomeTransactions();
  },

  sortDepositOrders(orderVal) {
    this.state.depOrderBy = orderVal;
    this.renderDepositBuyOrders();
  },

  filterDepDate(range) {
    this.state.depDateFilter = range;
    document.getElementById('chipDateAll')?.classList.toggle('active', range === 'ALL');
    document.getElementById('chipDate7')?.classList.toggle('active', range === '7D');
    document.getElementById('chipDate30')?.classList.toggle('active', range === '30D');
    document.getElementById('chipDate90')?.classList.toggle('active', range === '90D');
    this.renderDepositBuyOrders();
  },

  filterDepStatus(status) {
    this.state.depStatusFilter = status;
    document.getElementById('chipStatusAll')?.classList.toggle('active', status === 'ALL');
    document.getElementById('chipStatusProcessing')?.classList.toggle('active', status === 'PROCESSING');
    document.getElementById('chipStatusSubmit')?.classList.toggle('active', status === 'SUBMIT');
    document.getElementById('chipStatusSuccess')?.classList.toggle('active', status === 'SUCCESS');
    document.getElementById('chipStatusClose')?.classList.toggle('active', status === 'CLOSE');
    this.renderDepositBuyOrders();
  },

  renderDepositBuyOrders() {
    const container = document.getElementById('depositBuyOrdersContainer');
    if (!container) return;

    let filtered = [...this.state.depositOrders];
    const now = Date.now();

    if (this.state.depDateFilter === '7D') {
      filtered = filtered.filter(o => (now - new Date(o.timestamp).getTime()) <= 7 * 24 * 60 * 60 * 1000);
    } else if (this.state.depDateFilter === '30D') {
      filtered = filtered.filter(o => (now - new Date(o.timestamp).getTime()) <= 30 * 24 * 60 * 60 * 1000);
    } else if (this.state.depDateFilter === '90D') {
      filtered = filtered.filter(o => (now - new Date(o.timestamp).getTime()) <= 90 * 24 * 60 * 60 * 1000);
    }

    if (this.state.depStatusFilter !== 'ALL') {
      filtered = filtered.filter(o => o.status.toUpperCase() === this.state.depStatusFilter);
    }

    // Apply Order By sorting
    const orderVal = this.state.depOrderBy || 'NEWEST';
    if (orderVal === 'NEWEST') {
      filtered.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    } else if (orderVal === 'OLDEST') {
      filtered.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    } else if (orderVal === 'AMOUNT_DESC') {
      filtered.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    } else if (orderVal === 'AMOUNT_ASC') {
      filtered.sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div class="card text-center text-muted" style="padding: 2rem;">No deposit buy orders match your selected filters.</div>`;
      return;
    }

    container.innerHTML = filtered.map(o => {
      let badgeClass = 'badge-processing';
      if (o.status === 'Submit') badgeClass = 'badge-submit';
      if (o.status === 'Success') badgeClass = 'badge-success-green';
      if (o.status === 'Close') badgeClass = 'badge-close-red';

      return `
        <div class="card" style="margin-bottom: 12px; border-left: 4px solid var(--primary-orange);">
          <div class="flex-between">
            <strong class="text-orange" style="font-size:0.9rem;">#DEP-${o.id}</strong>
            <span class="status-badge-pill ${badgeClass}">${o.status}</span>
          </div>

          <div class="flex-between margin-top-1">
            <div>
              <span style="font-size:0.75rem; color:var(--text-muted);">Amount</span>
              <h4 style="font-family:var(--font-heading); font-size:1.3rem; font-weight:800; color:var(--text-dark);">₹ ${o.amount.toFixed(2)}</h4>
            </div>
            <div style="text-align: right;">
              <span style="font-size:0.75rem; color:var(--text-muted);">USDT Equivalent</span>
              <h4 style="font-family:var(--font-heading); font-size:1.1rem; font-weight:800; color:var(--primary-orange);">${o.usdtAmount || Math.round(o.amount / 110)} USDT</h4>
            </div>
          </div>

          <div class="flex-between margin-top-1" style="font-size:0.75rem; color:var(--text-medium); border-top:1px solid var(--border-color); padding-top:8px;">
            <span><i class="fa-regular fa-credit-card text-orange"></i> ${o.paymentChannel || 'Paytm Wallet'}</span>
            <span><i class="fa-regular fa-clock"></i> ${new Date(o.timestamp).toLocaleString()}</span>
          </div>
          ${o.matchedNote ? `<div style="font-size:0.75rem; color:#15803d; background:#dcfce7; padding:4px 8px; border-radius:6px; margin-top:6px; font-weight:700;"><i class="fa-solid fa-bolt"></i> ${o.matchedNote}</div>` : ''}
        </div>
      `;
    }).join('');
  },

  copyAdminUpiId() {
    const upiId = document.getElementById('displayAdminUpiId')?.textContent || 'fintechpay@upi';
    navigator.clipboard.writeText(upiId);
    this.showToast(`Merchant UPI ID ${upiId} copied to clipboard!`, 'success');
  },

  handleUsdtDepositSubmit() {
    const usdtVal = Number(document.getElementById('usdtCalcInput')?.value || 1);
    const rate = this.state.stats?.exchangeRate || 110;
    const inrVal = usdtVal * rate;

    if (document.getElementById('depAmountInput')) {
      document.getElementById('depAmountInput').value = inrVal;
    }

    this.handleCreateDepositOrder(null, inrVal);
  },

  async handleCreateDepositOrder(arg1, arg2) {
    let e = null;
    let customAmount = null;

    if (arg1 && typeof arg1.preventDefault === 'function') {
      e = arg1;
      if (typeof arg2 === 'number') customAmount = arg2;
    } else if (typeof arg1 === 'number') {
      customAmount = arg1;
    } else if (typeof arg2 === 'number') {
      customAmount = arg2;
    }

    if (e) e.preventDefault();

    let amount = 100;
    if (typeof customAmount === 'number' && customAmount > 0) {
      amount = customAmount;
    } else {
      const inputVal = Number(document.getElementById('depAmountInput')?.value);
      const usdtVal = Number(document.getElementById('usdtCalcInput')?.value);
      amount = inputVal || (usdtVal ? usdtVal * 110 : 100);
    }

    const paymentChannel = document.getElementById('depChannelSelect')?.value || 'Paytm Wallet / UPI';
    
    if (!this.state.currentUser) {
      this.showToast('Please sign in first to complete payment deposit', 'danger');
      this.showLogin();
      return;
    }

    const userId = this.state.currentUser.id;

    if (!amount || amount <= 0) {
      return this.showToast('Please enter a valid deposit amount', 'danger');
    }

    // Fetch P2P Direct Match
    let targetUpiId = this.state.stats?.adminUpiId || '8104229900@upi';
    let targetMerchantName = this.state.stats?.merchantName || 'Fintech Hub';
    let matchedSellOrderId = null;

    try {
      const matchRes = await fetch(`/api/p2p/match-order?amount=${amount}&userId=${userId}`);
      if (matchRes.ok) {
        const matchData = await matchRes.json();
        if (matchData.hasMatch) {
          targetUpiId = matchData.upiId;
          targetMerchantName = matchData.peerName;
          matchedSellOrderId = matchData.sellOrderId;
          this.state.activeMatchedOrderId = matchedSellOrderId;
          
          if (document.getElementById('p2pPeerPayBox')) {
            document.getElementById('p2pPeerPayBox').style.display = 'block';
            document.getElementById('p2pPeerNameDisplay').textContent = `${matchData.peerName} (User #${matchData.peerUserId})`;
            document.getElementById('p2pPeerBankDisplay').textContent = `${matchData.payoutBank} (${matchData.accountNumber})`;
          }
        } else {
          this.state.activeMatchedOrderId = null;
          if (document.getElementById('p2pPeerPayBox')) {
            document.getElementById('p2pPeerPayBox').style.display = 'none';
          }
        }
      }
    } catch (err) {
      console.warn('P2P match lookup error:', err);
    }

    const rate = this.state.stats?.exchangeRate || 110;
    const usdtVal = (amount / rate).toFixed(2);

    // Construct Dynamic UPI Deep Link URI & QR Code API
    const upiUri = `upi://pay?pa=${targetUpiId}&pn=${encodeURIComponent(targetMerchantName)}&am=${amount.toFixed(2)}&cu=INR&tn=P2P%20Deposit%20Order`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiUri)}`;

    if (document.getElementById('paySummaryInr')) document.getElementById('paySummaryInr').textContent = `₹ ${amount.toFixed(2)}`;
    if (document.getElementById('paySummaryUsdt')) document.getElementById('paySummaryUsdt').textContent = `${usdtVal} USDT`;
    
    if (document.getElementById('displayAdminUpiId')) {
      document.getElementById('displayAdminUpiId').textContent = targetUpiId;
    }

    // Render QR Code using Client-side QRCode library if available
    const qrBox = document.getElementById('qrcodeCanvasBox');
    const qrImg = document.getElementById('displayDynamicQrCode');

    if (qrBox) {
      qrBox.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        try {
          new QRCode(qrBox, {
            text: upiUri,
            width: 190,
            height: 190,
            colorDark: "#1e1e2d",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
          });
          if (qrImg) qrImg.style.display = 'none';
        } catch (err) {
          if (qrImg) {
            qrImg.style.display = 'block';
            qrImg.src = qrApiUrl;
          }
        }
      } else if (qrImg) {
        qrImg.style.display = 'block';
        qrImg.src = qrApiUrl;
      }
    } else if (qrImg) {
      qrImg.style.display = 'block';
      qrImg.src = qrApiUrl;
    }

    if (document.getElementById('qrAmountBadge')) {
      document.getElementById('qrAmountBadge').textContent = `₹ ${amount.toFixed(2)}`;
    }
    if (document.getElementById('payBtnAmountText')) {
      document.getElementById('payBtnAmountText').textContent = `₹ ${amount.toFixed(2)}`;
    }
    if (document.getElementById('btnDirectUpiPayLink')) {
      document.getElementById('btnDirectUpiPayLink').href = upiUri;
    }

    if (document.getElementById('payMethodUsedSelect')) {
      document.getElementById('payMethodUsedSelect').value = paymentChannel || 'Paytm Wallet / UPI';
    }

    this.switchAppTab('deposit-payment');
  },

  selectFixedAmount(type, amount, btnElem) {
    if (type === 'dep') {
      const input = document.getElementById('depAmountInput');
      if (input) input.value = amount;
      if (btnElem && btnElem.parentElement) {
        btnElem.parentElement.querySelectorAll('.btn-preset-chip').forEach(b => b.classList.remove('active'));
        btnElem.classList.add('active');
      }
      this.handleCreateDepositOrder(null, amount);
    } else if (type === 'sell') {
      const input = document.getElementById('sellAmountInput');
      if (input) input.value = amount;
      if (btnElem && btnElem.parentElement) {
        btnElem.parentElement.querySelectorAll('.btn-preset-chip').forEach(b => b.classList.remove('active'));
        btnElem.classList.add('active');
      }
    }
  },

  selectFixedUsdt(val, btnElem) {
    const input = document.getElementById('usdtCalcInput');
    if (input) {
      input.value = val;
      this.calcUsdtReceive();
    }
    if (btnElem && btnElem.parentElement) {
      btnElem.parentElement.querySelectorAll('.btn-preset-chip').forEach(b => b.classList.remove('active'));
      btnElem.classList.add('active');
    }
  },

  async handleConfirmDepositPayment(e) {
    if (e) e.preventDefault();
    const amount = Number(document.getElementById('depAmountInput').value);
    const paymentChannel = document.getElementById('payMethodUsedSelect').value;
    const utrNumber = document.getElementById('payUtrInput').value.trim();
    const userId = this.state.currentUser ? this.state.currentUser.id : '';
    const matchedSellOrderId = this.state.activeMatchedOrderId;

    if (!userId) return this.showToast('Please sign in first', 'danger');

    if (!utrNumber || utrNumber.length < 6) {
      return this.showToast('Please enter valid 12-digit UTR / Reference Number', 'danger');
    }

    try {
      const res = await fetch('/api/user/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, userId, paymentChannel, utrNumber, matchedSellOrderId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (document.getElementById('payUtrInput')) document.getElementById('payUtrInput').value = '';
      this.state.activeMatchedOrderId = null;

      this.showToast(data.message || `₹${amount} added to wallet balance & credited!`, 'success');
      this.switchAppTab('home');
      await this.loadDepositBuyOrders();
      await this.loadUser();
    } catch (err) {
      this.showToast(err.message, 'danger');
    }
  },

  // SCORE ROLL OUT CONTROLLER
  openScoreDetailView() {
    this.switchAppTab('score-detail');
  },

  calcScoreInrPreview() {
    const inputVal = Number(document.getElementById('convertScoreInput').value) || 0;
    const scoreRate = this.state.stats?.scoreRate || 10.00;
    const calculatedInr = (inputVal / 100) * scoreRate;
    document.getElementById('previewRollOutInr').textContent = calculatedInr.toFixed(2);
  },

  async handleScoreConvert(e) {
    if (e) e.preventDefault();
    const points = Number(document.getElementById('convertScoreInput').value);
    const userId = this.state.currentUser ? this.state.currentUser.id : '';
    if (!userId) return this.showToast('Please sign in first', 'danger');

    try {
      const res = await fetch('/api/user/convert-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, points })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.showToast(data.message, 'success');
      document.getElementById('convertScoreInput').value = '';
      document.getElementById('previewRollOutInr').textContent = '0.00';
      await this.loadAllAppData();
    } catch (err) {
      this.showToast(err.message, 'danger');
    }
  },

  bindAppNavigation() {
    document.querySelectorAll('.nav-tab-item').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.getAttribute('data-tab');
        this.switchAppTab(targetTab);
      });
    });
  },

  switchAppTab(tabId) {
    if (this.state.activeAppTab && this.state.activeAppTab !== tabId) {
      this.state.previousTab = this.state.activeAppTab;
    }
    this.state.activeAppTab = tabId;
    localStorage.setItem('fintech_active_tab', tabId);

    document.querySelectorAll('.nav-tab-item').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.app-tab-view').forEach(view => {
      view.classList.toggle('active', view.id === `tab-${tabId}`);
    });

    const botWidget = document.getElementById('floatingBotWidget');
    if (botWidget) {
      botWidget.style.display = tabId === 'support' ? 'none' : 'flex';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tabId === 'support') {
      this.loadSupportMessages();
    }
  },

  openSupportChat() {
    this.switchAppTab('support');
    this.loadSupportMessages();
  },

  async loadSupportMessages() {
    const userId = this.state.currentUser ? this.state.currentUser.id : (localStorage.getItem('fintech_user_id') || 'GUEST');
    try {
      const [mRes, pRes] = await Promise.all([
        fetch(`/api/support/messages?userId=${userId}`),
        fetch(`/api/support/presence?userId=${userId}`)
      ]);

      let isAdminTyping = false;
      let isAdminOnline = true;
      if (pRes && pRes.ok) {
        const presence = await pRes.json();
        isAdminTyping = !!presence.isAdminTyping;
        isAdminOnline = presence.isAdminOnline !== undefined ? !!presence.isAdminOnline : true;
      }

      const statusSpan = document.getElementById('userChatAgentStatusText');
      const dotBadge = document.getElementById('userChatOnlineDot');

      if (statusSpan) {
        if (isAdminTyping) {
          statusSpan.innerHTML = '<span class="uc-typing-text"><i class="fa-solid fa-pen-nib"></i> typing...</span>';
        } else if (isAdminOnline) {
          statusSpan.innerHTML = '<i class="fa-solid fa-circle" style="font-size:0.45rem; color:#4ade80;"></i> online';
        } else {
          statusSpan.innerHTML = 'offline';
        }
      }

      if (dotBadge) {
        dotBadge.style.display = isAdminOnline ? 'block' : 'none';
      }

      if (mRes.ok) {
        const msgs = await mRes.json();
        this.renderUserChatMessages(msgs, isAdminTyping);
      }

      if (document.getElementById('tab-support')?.classList.contains('active')) {
        await fetch('/api/support/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, reader: 'user' })
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Support messages fetch error:', e);
    }
  },

  renderUserChatMessages(msgs, isAdminTyping = false) {
    const container = document.getElementById('userChatStream');
    if (!container) return;

    let html = `
      <div class="wa-date-pill"><span>TODAY</span></div>
      <div class="wa-e2e-pill">
        <i class="fa-solid fa-lock" style="font-size:0.7rem; color:#ff6600;"></i>
        <span>Messages are end-to-end encrypted with ROTERPAY Helpdesk.</span>
      </div>
    `;

    if (!msgs || msgs.length === 0) {
      const userName = this.state.currentUser ? this.state.currentUser.name : 'there';
      html += `
        <div style="text-align: center; padding: 2rem 1rem; color: #667781;">
          <div style="width: 54px; height: 54px; border-radius: 50%; background: #ffffff; color: var(--primary-orange); display: inline-flex; align-items: center; justify-content: center; font-size: 1.4rem; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <i class="fa-solid fa-headset"></i>
          </div>
          <strong style="display: block; color: #111b21; font-size: 0.95rem; margin-bottom: 4px;">Hello ${userName}! 👋</strong>
          <p style="font-size: 0.8rem; color: #667781; max-width: 260px; margin: 0 auto;">Ask questions about Deposits, Withdrawals or Claims. We are online to help you 24/7.</p>
        </div>
      `;
    } else {
      html += msgs.map(m => {
        const isAdmin = m.sender === 'admin';
        const isSeen = m.isRead === 1 || m.isRead === true || m.isRead === '1';
        const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const escapedText = (m.message || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        if (isAdmin) {
          return `
            <div class="uc-bubble-row admin-msg">
              <div class="uc-bubble admin">
                <div class="uc-bubble-sender">ROTERPAY Support <i class="fa-solid fa-circle-check" style="color:#00a884; font-size:0.65rem;"></i></div>
                <div>${m.message}</div>
                <div class="uc-bubble-time">${timeStr}</div>
              </div>
            </div>
          `;
        } else {
          return `
            <div class="uc-bubble-row user-msg">
              <div class="uc-bubble user">
                <div>${m.message}</div>
                <div class="uc-bubble-time">
                  ${timeStr} <i class="fa-solid fa-check-double" style="font-size:0.65rem; color:${isSeen ? '#53bdeb' : '#8696a0'};" title="${isSeen ? 'Read' : 'Delivered'}"></i>
                  <div class="uc-bubble-actions">
                    <button type="button" class="uc-msg-btn" onclick="FintechApp.editUserMessage(${m.id}, '${escapedText}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="uc-msg-btn del" onclick="FintechApp.deleteUserMessage(${m.id})" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }
      }).join('');
    }

    if (isAdminTyping) {
      html += `
        <div class="uc-bubble-row admin-msg">
          <div class="uc-typing-bubble" title="ROTERPAY Support is typing...">
            <span class="uc-dot"></span>
            <span class="uc-dot"></span>
            <span class="uc-dot"></span>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  },

  async editUserMessage(id, oldText) {
    const newText = prompt('Edit your message:', oldText);
    if (newText === null) return;
    const clean = newText.trim();
    if (!clean || clean === oldText.trim()) return;

    try {
      const res = await fetch('/api/support/message/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, message: clean, editor: 'User' })
      });
      if (res.ok) {
        await this.loadSupportMessages();
      }
    } catch (e) {
      console.warn('Edit user message error:', e);
    }
  },

  async deleteUserMessage(id) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      const res = await fetch('/api/support/message/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, editor: 'User' })
      });
      if (res.ok) {
        await this.loadSupportMessages();
      }
    } catch (e) {
      console.warn('Delete user message error:', e);
    }
  },

  async clearUserChat() {
    const userId = this.state.currentUser ? this.state.currentUser.id : (localStorage.getItem('fintech_user_id') || 'GUEST');
    if (!confirm('Clear all your chat messages?')) return;
    try {
      await fetch('/api/admin/support/thread/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      await this.loadSupportMessages();
    } catch (e) {
      console.warn('Clear user chat error:', e);
    }
  },

  sendUserTypingSignal() {
    const userId = this.state.currentUser ? this.state.currentUser.id : (localStorage.getItem('fintech_user_id') || 'GUEST');
    fetch('/api/support/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, sender: 'user', isTyping: true })
    }).catch(() => {});
  },

  async handleSendSupportMessage(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('inputUserChatMsg');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const userId = this.state.currentUser ? this.state.currentUser.id : (localStorage.getItem('fintech_user_id') || 'GUEST');
    const userName = this.state.currentUser ? this.state.currentUser.name : 'Guest User';

    input.value = '';
    
    try {
      const res = await fetch('/api/support/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userName, message: text })
      });
      if (res.ok) {
        await this.loadSupportMessages();
      }
    } catch (err) {
      this.showToast('Failed to send message', 'danger');
    }
  },

  sendPresetMsg(text) {
    const input = document.getElementById('inputUserChatMsg');
    if (input) {
      input.value = text;
      this.handleSendSupportMessage();
    }
  },

  goBackFromPayment() {
    if (this.state.previousTab) {
      this.switchAppTab(this.state.previousTab);
    } else {
      this.switchAppTab('deposit-orders');
    }
  },

  // DATA LOADERS
  async loadAllAppData() {
    try {
      await Promise.all([
        this.loadUser(),
        this.loadStats(),
        this.loadOffers(),
        this.loadWallets(),
        this.loadTasks(),
        this.loadNotifications(),
        this.loadDepositBuyOrders(),
        this.loadSellOrders()
      ]);
      this.renderHomeTransactions();
    } catch (err) {
      console.error('Data loading error:', err);
    }
  },

  renderHomeTransactions() {
    const emptyState = document.getElementById('txnEmptyState');
    const txnList = document.getElementById('txnList');
    if (!txnList) return;

    const allOrders = [
      ...(this.state.depositOrders || []).map(o => ({ ...o, itemCategory: 'Deposit' })),
      ...(this.state.sellOrders || []).map(o => ({ ...o, itemCategory: 'Withdrawal' }))
    ];

    allOrders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (allOrders.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      txnList.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    txnList.style.display = 'block';

    txnList.innerHTML = allOrders.map(o => {
      let badgeClass = 'badge-processing';
      if (o.status === 'Pending') badgeClass = 'badge-pending';
      if (o.status === 'Submit' || o.status === 'Submitted') badgeClass = 'badge-submit';
      if (o.status === 'Success') badgeClass = 'badge-success-green';
      if (o.status === 'Timeout') badgeClass = 'badge-timeout';
      if (o.status === 'Close') badgeClass = 'badge-close-red';

      const isDeposit = o.itemCategory === 'Deposit';
      const icon = isDeposit ? 'fa-arrow-up text-orange' : 'fa-arrow-down text-blue';
      const orderPrefix = isDeposit ? 'DEP' : 'SELL';

      return `
        <div style="background:#ffffff; padding:12px; border-radius:12px; margin-bottom:10px; border:1px solid var(--orange-border); display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:38px; height:38px; border-radius:50%; background:var(--orange-light); display:flex; align-items:center; justify-content:center; font-size:1.1rem;">
              <i class="fa-solid ${icon}"></i>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                <strong style="font-size:0.88rem; color:var(--text-dark);">#${orderPrefix}-${o.id}</strong>
                <span class="status-badge-pill ${badgeClass}">${o.status}</span>
              </div>
              <span style="font-size:0.75rem; color:var(--text-muted); display:block; margin-top:2px;">${o.paymentChannel || o.payoutBank || 'Wallet'} • ${new Date(o.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
          <div style="text-align:right;">
            <strong style="font-family:var(--font-heading); font-size:1.05rem; color:${isDeposit ? 'var(--primary-orange)' : 'var(--accent-blue)'};">${isDeposit ? '+' : '-'}₹ ${o.amount.toFixed(2)}</strong>
            <span style="font-size:0.72rem; color:var(--text-muted); display:block;">${o.usdtAmount || Math.round(o.amount / 110)} USDT</span>
          </div>
        </div>
      `;
    }).join('');
  },

  async loadUser() {
    if (!this.state.currentUser) {
      if (document.getElementById('userName')) document.getElementById('userName').textContent = 'Click to Login';
      if (document.getElementById('userId')) document.getElementById('userId').textContent = 'Guest';
      return;
    }

    const activeId = this.state.currentUser.id;
    const res = await fetch(`/api/user?id=${activeId}`);
    if (!res.ok) return;
    const user = await res.json();
    this.state.currentUser = user;

    if (document.getElementById('userName')) document.getElementById('userName').textContent = user.name;
    if (document.getElementById('userId')) document.getElementById('userId').textContent = user.id;

    if (document.getElementById('homeBalance')) document.getElementById('homeBalance').textContent = user.balance.toFixed(2);
    if (document.getElementById('homeDeposit')) document.getElementById('homeDeposit').textContent = user.deposit.toFixed(2);
    if (document.getElementById('homeWithdrawal')) document.getElementById('homeWithdrawal').textContent = user.withdrawal.toFixed(2);

    // Score Page Data
    if (document.getElementById('userScoreDisplay')) document.getElementById('userScoreDisplay').textContent = (user.scorePoints || 0).toLocaleString();
    if (document.getElementById('scoreBalVal')) document.getElementById('scoreBalVal').textContent = user.balance.toFixed(2);
    if (document.getElementById('scoreDepVal')) document.getElementById('scoreDepVal').textContent = user.deposit.toFixed(2);
    if (document.getElementById('scoreWithVal')) document.getElementById('scoreWithVal').textContent = user.withdrawal.toFixed(2);
    if (document.getElementById('scoreCommVal')) document.getElementById('scoreCommVal').textContent = user.commission.toFixed(2);

    if (document.getElementById('paymentBalance')) document.getElementById('paymentBalance').textContent = user.balance.toFixed(0);
    if (document.getElementById('paymentReward')) document.getElementById('paymentReward').textContent = user.cashbackReward || 0;
    if (document.getElementById('paymentPending')) document.getElementById('paymentPending').textContent = user.cashbackPending || 0;

    if (document.getElementById('statBalance')) document.getElementById('statBalance').textContent = user.balance.toFixed(2);
    if (document.getElementById('statSell')) document.getElementById('statSell').textContent = (user.sellTotal || 0).toFixed(2);
    if (document.getElementById('statDeposit')) document.getElementById('statDeposit').textContent = user.deposit.toFixed(2);
    if (document.getElementById('statCommission')) document.getElementById('statCommission').textContent = user.commission.toFixed(2);

    if (document.getElementById('assetDeposit')) document.getElementById('assetDeposit').textContent = user.deposit.toFixed(0);
    if (document.getElementById('assetWithdraw')) document.getElementById('assetWithdraw').textContent = user.withdrawal.toFixed(0);
    if (document.getElementById('assetCommission')) document.getElementById('assetCommission').textContent = user.commission.toFixed(0);

    if (document.getElementById('mdlBal')) document.getElementById('mdlBal').textContent = user.balance.toFixed(2);
    if (document.getElementById('mdlDep')) document.getElementById('mdlDep').textContent = user.deposit.toFixed(2);
    if (document.getElementById('mdlWith')) document.getElementById('mdlWith').textContent = user.withdrawal.toFixed(2);
    if (document.getElementById('mdlComm')) document.getElementById('mdlComm').textContent = user.commission.toFixed(2);
  },

  async loadStats() {
    try {
      const res = await fetch('/api/stats');
      const stats = await res.json();
      this.state.stats = stats || {};

      if (document.getElementById('quickUsdtRate')) document.getElementById('quickUsdtRate').textContent = `${stats.exchangeRate || 110}INR`;
      if (document.getElementById('scoreRateBadge')) document.getElementById('scoreRateBadge').textContent = `100 Score = ₹ ${stats.scoreRate || 10} INR`;
      if (document.getElementById('statExchangeRate')) document.getElementById('statExchangeRate').textContent = stats.exchangeRate || 110;
      if (document.getElementById('statInProcessAmt')) document.getElementById('statInProcessAmt').textContent = Number(stats.inProcessAmount || 0).toFixed(2);
      if (document.getElementById('statInProcessOrders')) document.getElementById('statInProcessOrders').textContent = stats.inProcessOrders || 0;
      if (document.getElementById('statCommissionRate')) document.getElementById('statCommissionRate').textContent = Number(stats.commissionRate || 4).toFixed(2);
      if (document.getElementById('statEstIncome')) document.getElementById('statEstIncome').textContent = Number(stats.estimatedIncome || 0).toFixed(2);
      if (document.getElementById('appVersionDisplay')) document.getElementById('appVersionDisplay').textContent = stats.appVersion || 'v1.1.9';

      const btnSell = document.getElementById('btnToggleSelling');
      if (btnSell) {
        if (stats.isSellingOpen) {
          btnSell.textContent = 'Selling Active (Open)';
          btnSell.style.background = '#ff6600';
        } else {
          btnSell.textContent = 'Closed Selling';
          btnSell.style.background = '#f59e0b';
        }
      }
    } catch (e) {
      console.warn('loadStats caught error:', e);
    }
  },

  async loadOffers() {
    try {
      const userId = this.state.currentUser ? this.state.currentUser.id : '';
      const res = await fetch(`/api/payment/offers?userId=${userId}`);
      if (res.ok) {
        const offers = await res.json();
        this.state.offers = Array.isArray(offers) ? offers : [];
      } else {
        this.state.offers = [];
      }
    } catch (e) {
      this.state.offers = [];
    }
    this.renderOffers();
  },

  async loadWallets() {
    try {
      const res = await fetch('/api/wallets');
      if (res.ok) {
        const wallets = await res.json();
        this.state.wallets = Array.isArray(wallets) ? wallets : [];
      } else {
        this.state.wallets = [];
      }
    } catch (e) {
      this.state.wallets = [];
    }
    this.renderWallets();
  },

  async loadTasks() {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const tasks = await res.json();
        this.state.tasks = Array.isArray(tasks) ? tasks : [];
      } else {
        this.state.tasks = [];
      }
    } catch (e) {
      this.state.tasks = [];
    }
    this.renderTasks();
  },

  // NOTIFICATIONS CONTROLLER
  async loadNotifications() {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        this.state.notifications = data.notifications || [];
        this.state.unreadCount = data.unreadCount || 0;

        const badge = document.getElementById('bellUnreadBadge');
        if (badge) {
          if (this.state.unreadCount > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = this.state.unreadCount;
          } else {
            badge.style.display = 'none';
          }
        }
      }
    } catch (e) {
      this.state.notifications = [];
    }

    this.renderNotifications();
  },

  filterNotifs(filter) {
    this.state.notifFilter = filter;
    document.getElementById('chipNotifAll')?.classList.toggle('active', filter === 'ALL');
    document.getElementById('chipNotifUnread')?.classList.toggle('active', filter === 'UNREAD');
    this.renderNotifications();
  },

  renderNotifications() {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;

    let filtered = [...this.state.notifications];
    if (this.state.notifFilter === 'UNREAD') {
      filtered = filtered.filter(n => !n.isRead);
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div class="text-center text-muted" style="padding: 2rem;">No ${this.state.notifFilter === 'UNREAD' ? 'unread' : ''} notifications.</div>`;
      return;
    }

    container.innerHTML = filtered.map(n => `
      <div style="background:${n.isRead ? '#ffffff' : 'var(--orange-light)'}; padding:12px; border-radius:12px; margin-bottom:10px; border:1px solid var(--orange-border); position:relative;">
        <div class="flex-between">
          <strong style="color:${n.isRead ? 'var(--text-dark)' : 'var(--primary-orange)'};">${n.title}</strong>
          <span style="font-size:0.7rem; color:var(--text-muted);">${n.time}</span>
        </div>
        <p style="font-size:0.82rem; margin-top:4px; color:var(--text-medium);">${n.body}</p>
        <div class="flex-between margin-top-1" style="font-size:0.75rem;">
          <span class="special-tag">${n.type || 'System'}</span>
          ${!n.isRead ? `<button class="auth-switch-link" onclick="FintechApp.markNotifRead(${n.id})" style="font-size:0.75rem;">Mark as Read</button>` : `<span class="text-muted"><i class="fa-solid fa-check"></i> Read</span>`}
        </div>
      </div>
    `).join('');
  },

  async markNotifRead(id) {
    const res = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    await this.loadNotifications();
  },

  async markAllNotifsRead() {
    const res = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true })
    });
    const data = await res.json();
    this.showToast('All notifications marked as read!', 'success');
    await this.loadNotifications();
  },

  sortPaymentOffers(orderVal) {
    this.state.paymentOrderBy = orderVal;
    this.renderOffers();
  },

  renderOffers() {
    const container = document.getElementById('paymentOffersList');
    if (!container) return;

    let filtered = [...this.state.offers];
    if (this.state.filterCategory !== 'ALL') {
      filtered = filtered.filter(o => o.category === this.state.filterCategory);
    }

    // Apply Order By sorting
    const orderVal = this.state.paymentOrderBy || 'NEWEST';
    if (orderVal === 'BONUS_DESC') {
      filtered.sort((a, b) => Number(b.specialBonus || 0) - Number(a.specialBonus || 0));
    } else if (orderVal === 'AMOUNT_DESC') {
      filtered.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    } else if (orderVal === 'AMOUNT_ASC') {
      filtered.sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
    } else if (orderVal === 'NEWEST') {
      filtered.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div class="text-center text-muted" style="padding: 2rem;">No offers in this category.</div>`;
      return;
    }

    const isSpecialOn = this.state.stats?.specialRewardActive !== false;

    container.innerHTML = filtered.map(o => `
      <div class="offer-card">
        <div class="offer-left">
          <h3>INR</h3>
          <div class="offer-amt">Amount: <strong>∫ ${o.amount}</strong></div>
          <div class="offer-income">
            Income: +${o.income.toFixed(2)}
            ${isSpecialOn ? `<span class="special-tag">+ ∫ ${o.specialBonus.toFixed(2)} Special</span>` : ''}
          </div>
        </div>
        <div class="offer-right" style="text-align: right;">
          <div class="offer-code" style="margin-bottom: 8px;">Code: ${o.code}</div>
          ${o.isClaimedToday ? `
            <button class="btn-orange-pill" disabled style="background:#e2e8f0; color:#64748b; cursor:not-allowed; box-shadow:none; padding:6px 14px; font-weight:800; border-radius:20px;">
              <i class="fa-solid fa-check"></i> Claimed
            </button>
          ` : `
            <button class="btn-orange-pill btn-claim-offer" data-id="${o.id}">Claim</button>
          `}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-claim-offer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.getAttribute('data-id'));
        this.claimOffer(id);
      });
    });
  },

  // TOOL & PAYMENT OPTIONS CONTROLLER (MATCHING SCREENSHOTS)
  openAddToolSubView() {
    const mainView = document.getElementById('toolMainView');
    const subView = document.getElementById('addToolSubView');
    if (mainView) mainView.style.display = 'none';
    if (subView) subView.style.display = 'block';
    this.renderPaymentToolOptions();
  },

  backToToolMainView() {
    const mainView = document.getElementById('toolMainView');
    const subView = document.getElementById('addToolSubView');
    if (subView) subView.style.display = 'none';
    if (mainView) mainView.style.display = 'block';
  },

  switchToolSegment(segment) {
    this.state.activeToolSegment = segment;
    document.getElementById('btnToolTabPersonal')?.classList.toggle('active', segment === 'Personal');
    document.getElementById('btnToolTabBusiness')?.classList.toggle('active', segment === 'Business');
    
    const catalog = this.state.paymentToolsCatalog[segment] || [];
    if (catalog.length > 0) {
      this.state.selectedToolOption = catalog[0].name;
    }
    this.renderPaymentToolOptions();
  },

  renderPaymentToolOptions() {
    const container = document.getElementById('paymentToolsOptionsContainer');
    if (!container) return;

    const currentSegment = this.state.activeToolSegment || 'Personal';
    const toolsList = this.state.paymentToolsCatalog[currentSegment] || [];

    container.innerHTML = toolsList.map(t => {
      const isSelected = t.name === this.state.selectedToolOption;
      return `
        <div class="payment-option-card ${isSelected ? 'selected' : ''}" data-name="${t.name}">
          <div class="payment-card-left">
            <div class="payment-icon-box ${t.iconClass}">${t.iconText}</div>
            <div class="payment-card-info">
              <div class="payment-card-title">${t.name}</div>
              ${t.sub ? `<div class="payment-card-sub">${t.sub}</div>` : ''}
            </div>
          </div>
          ${t.payout ? `<div class="payment-card-right"><span class="payout-label">Payout</span></div>` : ''}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.payment-option-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const name = e.currentTarget.getAttribute('data-name');
        this.state.selectedToolOption = name;
        this.renderPaymentToolOptions();
      });
    });
  },

  confirmToolSelection() {
    const selectedName = this.state.selectedToolOption || 'Freecharge';
    const titleElem = document.getElementById('modalSelectedToolTitle');
    const nameInput = document.getElementById('toolSelectedNameInput');
    const typeInput = document.getElementById('toolSelectedTypeInput');
    const labelElem = document.getElementById('lblToolAddressInput');

    if (titleElem) titleElem.textContent = selectedName;
    if (nameInput) nameInput.value = selectedName;
    if (typeInput) typeInput.value = this.state.activeToolSegment || 'Personal';
    if (labelElem) labelElem.textContent = `${selectedName} Number / VPA / Account`;

    document.getElementById('modalToolDetailsInput')?.classList.add('active');
  },

  async deleteWalletTool(id) {
    if (!confirm('Are you sure you want to remove this payment tool?')) return;
    try {
      const res = await fetch(`/api/wallets/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.showToast('Payment tool removed successfully', 'info');
      await this.loadWallets();
    } catch (e) {
      this.showToast(e.message || 'Failed to remove tool', 'danger');
    }
  },

  renderWallets() {
    const emptyState = document.getElementById('toolEmptyState');
    const listContainer = document.getElementById('walletsList');
    const content = document.getElementById('savedWalletsListContent');

    if (!this.state.wallets.length) {
      if (emptyState) emptyState.style.display = 'block';
      if (listContainer) listContainer.style.display = 'none';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      if (listContainer) listContainer.style.display = 'block';

      if (content) {
        content.innerHTML = this.state.wallets.map(w => `
          <div class="saved-tool-card">
            <div class="saved-tool-header">
              <div class="saved-tool-left">
                <strong class="saved-tool-title">${w.name}</strong>
                <span class="saved-tool-type">${w.type || 'Personal'}</span>
              </div>
              <button class="btn btn-secondary btn-delete-tool" data-id="${w.id}" title="Remove Tool" style="padding: 4px 10px; font-size: 0.75rem; color: #ef4444;">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
            ${w.holderName ? `<div style="font-size: 0.82rem; color: var(--text-medium); margin-top: 4px;">Holder: <strong>${w.holderName}</strong></div>` : ''}
            <div class="saved-tool-address">${w.address}</div>
          </div>
        `).join('');

        content.querySelectorAll('.btn-delete-tool').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const id = Number(e.currentTarget.getAttribute('data-id'));
            this.deleteWalletTool(id);
          });
        });
      }
    }
  },

  // PIN CODE CONTROLLER (MATCHING USER SCREENSHOT)
  openPinCodeView() {
    this.switchAppTab('pincode');
    document.querySelectorAll('.pin-box').forEach(b => b.value = '');
    setTimeout(() => {
      document.querySelector('.pin-box[data-group="old"][data-idx="0"]')?.focus();
    }, 100);
  },

  initPinBoxAutoAdvance() {
    document.querySelectorAll('.pin-box').forEach(box => {
      box.addEventListener('input', (e) => {
        const val = e.target.value;
        const group = e.target.getAttribute('data-group');
        const idx = parseInt(e.target.getAttribute('data-idx'));

        if (val.length >= 1) {
          e.target.value = val.slice(-1);
          const nextBox = document.querySelector(`.pin-box[data-group="${group}"][data-idx="${idx + 1}"]`);
          if (nextBox) {
            nextBox.focus();
          } else {
            if (group === 'old') {
              document.querySelector('.pin-box[data-group="new"][data-idx="0"]')?.focus();
            } else if (group === 'new') {
              document.querySelector('.pin-box[data-group="confirm"][data-idx="0"]')?.focus();
            }
          }
        }
      });

      box.addEventListener('keydown', (e) => {
        const group = e.target.getAttribute('data-group');
        const idx = parseInt(e.target.getAttribute('data-idx'));

        if (e.key === 'Backspace' && !e.target.value) {
          const prevBox = document.querySelector(`.pin-box[data-group="${group}"][data-idx="${idx - 1}"]`);
          if (prevBox) {
            prevBox.focus();
          } else {
            if (group === 'confirm') {
              document.querySelector('.pin-box[data-group="new"][data-idx="5"]')?.focus();
            } else if (group === 'new') {
              document.querySelector('.pin-box[data-group="old"][data-idx="5"]')?.focus();
            }
          }
        }
      });
    });
  },

  confirmPinCodeChange() {
    const getPinGroup = (group) => {
      return Array.from(document.querySelectorAll(`.pin-box[data-group="${group}"]`))
        .map(b => b.value)
        .join('');
    };

    const oldPin = getPinGroup('old');
    const newPin = getPinGroup('new');
    const confirmPin = getPinGroup('confirm');

    if (newPin.length < 6) {
      return this.showToast('Please enter complete 6-digit New Pin', 'danger');
    }

    if (newPin !== confirmPin) {
      return this.showToast('New Pin and Confirm Pin do not match!', 'danger');
    }

    this.showToast('Security PIN updated successfully!', 'success');
    this.switchAppTab('my');
  },

  renderTasks() {
    const container = document.getElementById('taskCenterContainer');
    if (!container) return;

    container.innerHTML = this.state.tasks.map(t => `
      <div class="detail-row flex-between" style="padding: 10px 0;">
        <div>
          <strong>${t.title}</strong>
          <span style="display:block; font-size:0.75rem; color:var(--primary-orange);">${t.reward}</span>
        </div>
        <button class="btn-orange-pill" onclick="FintechApp.showToast('Task complete bonus credited!', 'success')" style="padding: 4px 12px; font-size:0.75rem;">Complete</button>
      </div>
    `).join('');
  },

  bindAppEvents() {
    document.getElementById('btnCopyId')?.addEventListener('click', () => {
      const activeId = this.state.currentUser ? this.state.currentUser.id : '';
      if (!activeId) return this.showToast('Please sign in first', 'danger');
      navigator.clipboard.writeText(activeId);
      this.showToast(`User ID ${activeId} copied to clipboard!`, 'success');
    });

    document.getElementById('btnNotificationsBell')?.addEventListener('click', () => {
      document.getElementById('modalNotifications')?.classList.add('active');
    });

    document.getElementById('btnQuickUsdt')?.addEventListener('click', () => {
      this.openUsdtDepositView();
    });
    document.getElementById('btnQuickTask')?.addEventListener('click', () => {
      this.openTaskRewardsView();
    });
    document.getElementById('btnQuickTeam')?.addEventListener('click', () => {
      this.openTeamView();
    });
    document.getElementById('btnQuickOrder')?.addEventListener('click', () => {
      document.getElementById('modalOrderCenter')?.classList.add('active');
    });

    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.state.filterCategory = e.currentTarget.getAttribute('data-filter');
        this.renderOffers();
      });
    });

    // TOOL TAB & ADD TOOL NAVIGATION EVENT LISTENERS
    document.getElementById('btnOpenAddToolView')?.addEventListener('click', () => {
      this.openAddToolSubView();
    });

    document.getElementById('btnAddNewToolHeader')?.addEventListener('click', () => {
      this.openAddToolSubView();
    });

    document.getElementById('btnBackToToolMain')?.addEventListener('click', () => {
      this.backToToolMainView();
    });

    document.getElementById('btnToolTabPersonal')?.addEventListener('click', () => {
      this.switchToolSegment('Personal');
    });

    document.getElementById('btnToolTabBusiness')?.addEventListener('click', () => {
      this.switchToolSegment('Business');
    });

    document.getElementById('btnConfirmToolSelection')?.addEventListener('click', () => {
      this.confirmToolSelection();
    });

    document.getElementById('formSubmitToolDetails')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const walletName = document.getElementById('toolSelectedNameInput').value;
      const walletType = document.getElementById('toolSelectedTypeInput').value;
      const walletAddress = document.getElementById('toolAccountAddressInput').value;
      const holderName = document.getElementById('toolHolderNameInput').value;

      try {
        const res = await fetch('/api/wallets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletName, walletAddress, walletType, holderName })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        document.getElementById('modalToolDetailsInput')?.classList.remove('active');
        e.target.reset();
        this.showToast(`${walletName} payment tool saved successfully!`, 'success');
        this.backToToolMainView();
        await this.loadWallets();
      } catch (err) {
        this.showToast(err.message, 'danger');
      }
    });

    document.getElementById('formConfirmDepositPayment')?.addEventListener('submit', (e) => {
      this.handleConfirmDepositPayment(e);
    });

    document.getElementById('btnToggleSelling')?.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/stats/toggle-selling', { method: 'POST' });
        const data = await res.json();
        this.showToast(`Selling status: ${data.isSellingOpen ? 'OPEN' : 'CLOSED'}`, 'info');
        await this.loadStats();
      } catch (e) {
        this.showToast('Failed to toggle selling state', 'danger');
      }
    });

    document.getElementById('btnAssetWallet')?.addEventListener('click', () => this.switchAppTab('tool'));
    document.getElementById('btnAssetService')?.addEventListener('click', () => this.openSupportChat());
    document.getElementById('btnAssetMessage')?.addEventListener('click', () => document.getElementById('modalNotifications')?.classList.add('active'));
    document.getElementById('btnAssetPin')?.addEventListener('click', () => this.openPinCodeView());

    // PIN CODE SCREEN EVENT LISTENERS
    document.getElementById('btnBackFromPin')?.addEventListener('click', () => this.switchAppTab('my'));
    document.getElementById('btnCancelPin')?.addEventListener('click', () => this.switchAppTab('my'));
    document.getElementById('btnConfirmPin')?.addEventListener('click', () => this.confirmPinCodeChange());
    this.initPinBoxAutoAdvance();

    // Dedicated Full-Page Live Support Chat Trigger
    document.getElementById('floatingBotWidget')?.addEventListener('click', () => {
      this.openSupportChat();
    });

    // LOGOUT ACCOUNT
    document.getElementById('btnLogout')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to logout of your account?')) {
        this.logout();
      }
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-close');
        document.getElementById(id)?.classList.remove('active');
      });
    });
  },

  deferredPrompt: null,

  initPwa() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  },

  async installPwaApp() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        this.showToast('🎉 Fintech Hub App installed on your phone!', 'success');
        document.getElementById('modalDownloadApp')?.classList.remove('active');
      }
      this.deferredPrompt = null;
    } else {
      alert('📱 How to install Fintech Hub App on your Mobile:\n\n1. In Chrome / Android: Tap the 3 dots (⋮) top right and select "Install app" or "Add to Home screen".\n\n2. In iPhone / Safari: Tap the Share button (⬆️) and select "Add to Home Screen".\n\nThis installs the full app directly to your home screen with no parsing errors!');
    }
  },

  openDownloadAppModal() {
    const modal = document.getElementById('modalDownloadApp');
    if (modal) {
      const ver = this.state.stats?.appVersion || 'v1.1.9';
      const dlUrl = this.state.stats?.appDownloadUrl || '/downloads/fintech-hub.apk';
      const verEl = document.getElementById('mdlAppVersion');
      if (verEl) verEl.textContent = ver;
      const dlBtn = document.getElementById('btnDirectDownloadApk');
      if (dlBtn) dlBtn.href = dlUrl;
      modal.classList.add('active');
    }
  },

  async claimOffer(offerId) {
    const userId = this.state.currentUser ? this.state.currentUser.id : '';
    if (!userId) {
      this.showToast('Please sign in first to claim cashback offers!', 'danger');
      this.showLogin();
      return;
    }
    try {
      const res = await fetch('/api/payment/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId, userId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.showToast(`🎉 Offer Claimed! +₹ ${data.earned.toFixed(2)} Commission & +50 Score Points added to wallet!`, 'success');
      await this.loadAllAppData();
    } catch (err) {
      this.showToast(err.message, 'danger');
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let iconClass = 'fa-circle-info text-orange';
    if (type === 'success') iconClass = 'fa-circle-check text-orange';
    if (type === 'danger') iconClass = 'fa-triangle-exclamation text-rose';

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // ==========================================
  // AUTHENTICATION & USER SESSION ENGINE
  // ==========================================
  onProfileClick() {
    if (this.state.currentUser) {
      this.switchAppTab('my');
    } else {
      this.showLogin();
    }
  },

  showLogin() {
    this.switchAppTab('login');
  },

  showRegister() {
    this.switchAppTab('register');
  },

  closeAuth() {
    this.switchAppTab('home');
  },

  togglePassVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const btn = input.nextElementSibling || input.parentElement?.querySelector('.btn-toggle-pass');
    if (input.type === 'password') {
      input.type = 'text';
      if (btn) btn.innerHTML = '<i class="fa-solid fa-eye-slash" style="color: var(--primary-orange);"></i>';
    } else {
      input.type = 'password';
      if (btn) btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
    }
  },

  async handleLogin(e) {
    if (e) e.preventDefault();
    const loginInput = document.getElementById('loginInputStr').value.trim();
    const password = document.getElementById('loginPasswordStr').value.trim();

    if (!loginInput || !password) {
      return this.showToast('Please enter mobile number/ID and password', 'danger');
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginInput, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.state.currentUser = data.user;
      this.state.authToken = data.token;
      localStorage.setItem('fintech_user_id', data.user.id);
      localStorage.setItem('fintech_token', data.token);
      localStorage.setItem('fintech_user_data', JSON.stringify(data.user));

      this.showToast(`Welcome back, ${data.user.name}!`, 'success');
      this.switchAppTab('home');
      
      await this.loadAllAppData();
    } catch (err) {
      this.showToast(err.message, 'danger');
    }
  },

  async handleRegister(e) {
    if (e) e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const referralCode = document.getElementById('regReferral')?.value.trim() || '';

    if (!name || !phone || !password) {
      return this.showToast('Please fill out all required fields', 'danger');
    }
    if (phone.length < 10) {
      return this.showToast('Please enter valid 10-digit mobile number', 'danger');
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, password, referralCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.state.currentUser = data.user;
      this.state.authToken = data.token;
      localStorage.setItem('fintech_user_id', data.user.id);
      localStorage.setItem('fintech_token', data.token);
      localStorage.setItem('fintech_user_data', JSON.stringify(data.user));

      this.showToast(data.message || 'Registration successful! Welcome bonus credited.', 'success');
      this.switchAppTab('home');

      await this.loadAllAppData();
    } catch (err) {
      this.showToast(err.message, 'danger');
    }
  },

  logout() {
    this.state.currentUser = null;
    this.state.authToken = null;
    localStorage.removeItem('fintech_user_id');
    localStorage.removeItem('fintech_token');
    localStorage.removeItem('fintech_user_data');
    
    this.loadUser();
    this.showLogin();
    this.showToast('Logged out of session', 'info');
  },

  async restoreSession() {
    const savedUserId = localStorage.getItem('fintech_user_id');
    const savedUserData = localStorage.getItem('fintech_user_data');

    if (savedUserId) {
      try {
        const res = await fetch(`/api/user?id=${savedUserId}`);
        if (res.ok) {
          const user = await res.json();
          this.state.currentUser = user;
          localStorage.setItem('fintech_user_data', JSON.stringify(user));
          this.loadUser();
          return true;
        } else if (res.status === 404) {
          localStorage.removeItem('fintech_user_id');
          localStorage.removeItem('fintech_token');
          localStorage.removeItem('fintech_user_data');
          this.state.currentUser = null;
          this.loadUser();
          return false;
        }
      } catch (err) {
        console.warn('Session restore error:', err);
      }
    }

    if (savedUserData) {
      try {
        const user = JSON.parse(savedUserData);
        this.state.currentUser = user;
        this.loadUser();
        return true;
      } catch (e) {}
    }

    this.loadUser();
    return false;
  }
};

// Keyboard Open & Viewport Lock Handler (Prevents Chat Header from shifting)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    if (document.getElementById('tab-support')?.classList.contains('active')) {
      const container = document.querySelector('#tab-support .user-chat-container');
      if (container) {
        container.style.height = `${window.visualViewport.height}px`;
      }
      window.scrollTo(0, 0);
      const stream = document.getElementById('userChatStream');
      if (stream) stream.scrollTop = stream.scrollHeight;
    }
  });

  window.visualViewport.addEventListener('scroll', () => {
    if (document.getElementById('tab-support')?.classList.contains('active')) {
      window.scrollTo(0, 0);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const chatInput = document.getElementById('inputUserChatMsg');
  if (chatInput) {
    chatInput.addEventListener('focus', () => {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      setTimeout(() => {
        window.scrollTo(0, 0);
        const stream = document.getElementById('userChatStream');
        if (stream) stream.scrollTop = stream.scrollHeight;
      }, 120);
    });
  }
});
