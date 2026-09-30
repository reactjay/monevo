/**
 * Monevo Admin Dashboard — Core Engine
 * Connects with /api/admin/* and provides interactive voice intelligence tracking
 */

const AdminApp = (() => {
  // App state
  const state = {
    currentTab: 'overview',
    autoRefreshInterval: 30,
    timerId: null,
    isLiveBackend: false,
    overview: null,
    users: [],
    voiceData: null,
    transactions: [],
    receipts: [],
    reports: [],
    userFilter: 'all',
    txSourceFilter: 'all',
    txTypeFilter: 'all',
  };

  // ── Mock Fallback Data (Active when running standalone or offline) ──
  const mockData = {
    overview: {
      metrics: {
        users: {
          total: 142,
          voiceModeCount: 89,
          textModeCount: 53,
          activeVoiceUsersCount: 114,
          businessCount: 68,
          personalCount: 74,
          onboardedCount: 131,
          pendingOnboarding: 11,
        },
        transactions: {
          total: 846,
          voiceCount: 538,
          textCount: 308,
          voicePercentage: 63.6,
          totalIncome: 14250000,
          totalExpense: 8120000,
          netVolume: 6130000,
          currency: 'NGN',
        },
        receipts: { total: 118 },
        reports: { total: 42 },
        system: {
          nodeEnv: 'production',
          nodeVersion: 'v22.5.0',
          uptimeSeconds: 148200,
          dbStatus: 'connected',
          activeConversations: 6,
          memoryHeapUsedMB: 68.4,
          assemblyAiConfigured: true,
          metaConfigured: true,
        },
      },
    },
    voiceData: {
      summary: {
        totalVoiceUsers: 114,
        usersInVoiceResponseMode: 89,
        totalVoiceTransactions: 538,
        totalVoiceVolume: 9450000,
        voiceIncomeTotal: 6200000,
        voiceExpenseTotal: 3250000,
        topCategories: [
          { category: 'fuel', count: 184, totalAmount: 1840000 },
          { category: 'inventory', count: 122, totalAmount: 4320000 },
          { category: 'food', count: 96, totalAmount: 480000 },
          { category: 'transport', count: 78, totalAmount: 390000 },
          { category: 'utilities', count: 58, totalAmount: 2420000 },
        ],
        assemblyAiEngine: {
          provider: 'AssemblyAI Universal Speech-to-Text',
          configured: true,
          languageModel: 'Multilingual / African English & Pidgin Optimized',
          ttsEngine: 'Microsoft Edge Neural TTS / Google Fallback',
        },
      },
      voiceUsers: [
        {
          _id: 'u1',
          name: 'Tunde Adeleke',
          phone: '+2348039281744',
          whatsappId: '2348039281744',
          profileType: 'business',
          businessName: 'Adeleke Logistics & Haulage',
          responseMode: 'voice',
          onboardingComplete: true,
          voiceTxCount: 46,
        },
        {
          _id: 'u2',
          name: 'Ngozi Okafor',
          phone: '+2348028193821',
          whatsappId: '2348028193821',
          profileType: 'business',
          businessName: 'Lekki Gourmet Bakery',
          responseMode: 'voice',
          onboardingComplete: true,
          voiceTxCount: 82,
        },
        {
          _id: 'u3',
          name: 'Ibrahim Musa',
          phone: '+2348109283741',
          whatsappId: '2348109283741',
          profileType: 'personal',
          businessName: '',
          responseMode: 'voice',
          onboardingComplete: true,
          voiceTxCount: 29,
        },
        {
          _id: 'u4',
          name: 'Folake Balogun',
          phone: '+2348149827361',
          whatsappId: '2348149827361',
          profileType: 'business',
          businessName: 'Fabrics by Folake',
          responseMode: 'voice',
          onboardingComplete: true,
          voiceTxCount: 38,
        },
      ],
      recentTranscripts: [
        {
          _id: 'tx_v1',
          date: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
          type: 'expense',
          amount: 18500,
          currency: 'NGN',
          category: 'fuel',
          description: 'Generator diesel top-up',
          transcript: 'I just bought eighteen thousand five hundred naira diesel for the bakery generator',
          source: 'voice',
          userId: {
            name: 'Ngozi Okafor',
            phone: '+2348028193821',
            businessName: 'Lekki Gourmet Bakery',
          },
        },
        {
          _id: 'tx_v2',
          date: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
          type: 'income',
          amount: 85000,
          currency: 'NGN',
          category: 'sales',
          description: 'Payment from client for wedding cake order',
          transcript: 'Customer just transferred 85k for the three tier wedding cake',
          source: 'voice',
          userId: {
            name: 'Ngozi Okafor',
            phone: '+2348028193821',
            businessName: 'Lekki Gourmet Bakery',
          },
        },
        {
          _id: 'tx_v3',
          date: new Date(Date.now() - 1000 * 60 * 64).toISOString(),
          type: 'expense',
          amount: 32000,
          currency: 'NGN',
          category: 'transport',
          description: 'Dispatch delivery for interstate goods',
          transcript: 'I spent 32000 on interstate waybill dispatch to Ibadan',
          source: 'voice',
          userId: {
            name: 'Tunde Adeleke',
            phone: '+2348039281744',
            businessName: 'Adeleke Logistics & Haulage',
          },
        },
        {
          _id: 'tx_v4',
          date: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
          type: 'expense',
          amount: 6500,
          currency: 'NGN',
          category: 'food',
          description: 'Lunch at local restaurant',
          transcript: 'Paid 6500 for lunch and drinks today',
          source: 'voice',
          userId: {
            name: 'Ibrahim Musa',
            phone: '+2348109283741',
            businessName: '',
          },
        },
      ],
    },
    users: [
      {
        _id: 'u1',
        name: 'Tunde Adeleke',
        phone: '+2348039281744',
        whatsappId: '2348039281744',
        profileType: 'business',
        businessName: 'Adeleke Logistics & Haulage',
        currency: 'NGN',
        responseMode: 'voice',
        onboardingComplete: true,
        metrics: {
          transactionCount: 46,
          voiceTransactionCount: 38,
          textTransactionCount: 8,
          income: 3800000,
          expense: 2100000,
          balance: 1700000,
          lastActive: new Date(Date.now() - 1000 * 60 * 64).toISOString(),
        },
      },
      {
        _id: 'u2',
        name: 'Ngozi Okafor',
        phone: '+2348028193821',
        whatsappId: '2348028193821',
        profileType: 'business',
        businessName: 'Lekki Gourmet Bakery',
        currency: 'NGN',
        responseMode: 'voice',
        onboardingComplete: true,
        metrics: {
          transactionCount: 82,
          voiceTransactionCount: 71,
          textTransactionCount: 11,
          income: 4250000,
          expense: 2450000,
          balance: 1800000,
          lastActive: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
        },
      },
      {
        _id: 'u3',
        name: 'Ibrahim Musa',
        phone: '+2348109283741',
        whatsappId: '2348109283741',
        profileType: 'personal',
        businessName: '',
        currency: 'NGN',
        responseMode: 'voice',
        onboardingComplete: true,
        metrics: {
          transactionCount: 29,
          voiceTransactionCount: 24,
          textTransactionCount: 5,
          income: 950000,
          expense: 420000,
          balance: 530000,
          lastActive: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        },
      },
      {
        _id: 'u4',
        name: 'Folake Balogun',
        phone: '+2348149827361',
        whatsappId: '2348149827361',
        profileType: 'business',
        businessName: 'Fabrics by Folake',
        currency: 'NGN',
        responseMode: 'voice',
        onboardingComplete: true,
        metrics: {
          transactionCount: 38,
          voiceTransactionCount: 30,
          textTransactionCount: 8,
          income: 2600000,
          expense: 1400000,
          balance: 1200000,
          lastActive: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
        },
      },
      {
        _id: 'u5',
        name: 'Chinedu Eze',
        phone: '+2348055667788',
        whatsappId: '2348055667788',
        profileType: 'personal',
        businessName: '',
        currency: 'NGN',
        responseMode: 'text',
        onboardingComplete: true,
        metrics: {
          transactionCount: 19,
          voiceTransactionCount: 2,
          textTransactionCount: 17,
          income: 650000,
          expense: 310000,
          balance: 340000,
          lastActive: new Date(Date.now() - 1000 * 60 * 540).toISOString(),
        },
      },
    ],
    transactions: [
      {
        _id: 't1',
        date: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
        type: 'expense',
        amount: 18500,
        currency: 'NGN',
        category: 'fuel',
        source: 'voice',
        description: 'Generator diesel top-up',
        transcript: 'I just bought eighteen thousand five hundred naira diesel for the bakery generator',
        userId: { name: 'Ngozi Okafor', phone: '+2348028193821' },
      },
      {
        _id: 't2',
        date: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        type: 'income',
        amount: 85000,
        currency: 'NGN',
        category: 'sales',
        source: 'voice',
        description: 'Payment for 3-tier wedding cake order',
        transcript: 'Customer just transferred 85k for the three tier wedding cake',
        userId: { name: 'Ngozi Okafor', phone: '+2348028193821' },
      },
      {
        _id: 't3',
        date: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        type: 'income',
        amount: 150000,
        currency: 'NGN',
        category: 'freelance',
        source: 'text',
        description: 'Frontend dashboard milestone payment',
        transcript: '',
        userId: { name: 'Chinedu Eze', phone: '+2348055667788' },
      },
      {
        _id: 't4',
        date: new Date(Date.now() - 1000 * 60 * 64).toISOString(),
        type: 'expense',
        amount: 32000,
        currency: 'NGN',
        category: 'transport',
        source: 'voice',
        description: 'Interstate waybill delivery fee',
        transcript: 'I spent 32000 on interstate waybill dispatch to Ibadan',
        userId: { name: 'Tunde Adeleke', phone: '+2348039281744' },
      },
      {
        _id: 't5',
        date: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        type: 'expense',
        amount: 6500,
        currency: 'NGN',
        category: 'food',
        source: 'voice',
        description: 'Lunch at restaurant',
        transcript: 'Paid 6500 for lunch and drinks today',
        userId: { name: 'Ibrahim Musa', phone: '+2348109283741' },
      },
    ],
    receipts: [
      {
        receiptNumber: 'REC-2026-0891',
        issuedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        payer: 'Mrs. Funke Adeyemi',
        recipient: 'Lekki Gourmet Bakery',
        amount: 85000,
        currency: 'NGN',
        description: '3-tier bespoke wedding cake deposit',
        userId: { name: 'Ngozi Okafor' },
      },
      {
        receiptNumber: 'REC-2026-0890',
        issuedAt: new Date(Date.now() - 1000 * 60 * 320).toISOString(),
        payer: 'Swift Distribution Co',
        recipient: 'Adeleke Logistics & Haulage',
        amount: 240000,
        currency: 'NGN',
        description: 'Haulage container clearance service',
        userId: { name: 'Tunde Adeleke' },
      },
    ],
    reports: [
      {
        weekStart: new Date(Date.now() - 7 * 86400000).toISOString(),
        weekEnd: new Date().toISOString(),
        totalIncome: 1250000,
        totalExpenses: 680000,
        net: 570000,
        transactionCount: 24,
        topCategories: [
          { category: 'inventory', amount: 380000, count: 8 },
          { category: 'fuel', amount: 190000, count: 11 },
          { category: 'transport', amount: 110000, count: 5 },
        ],
        generatedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        userId: { name: 'Ngozi Okafor', businessName: 'Lekki Gourmet Bakery' },
      },
    ],
  };

  // ── Helper: Format Currency ─────────────────────────────────────
  function formatMoney(amount, currency = '₦') {
    const num = Number(amount) || 0;
    return `${currency}${num.toLocaleString()}`;
  }

  // ── Helper: Format Date ─────────────────────────────────────────
  function formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ── API Fetcher ─────────────────────────────────────────────────
  async function fetchAPI(endpoint) {
    try {
      const res = await fetch(`/api/admin${endpoint}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.isLiveBackend = true;
      return data;
    } catch {
      state.isLiveBackend = false;
      return null;
    }
  }

  // ── Initialize App ──────────────────────────────────────────────
  async function init() {
    setupEventHandlers();
    await refreshAllData();
    setupAutoRefresh();
  }

  // ── Setup UI Event Listeners ────────────────────────────────────
  function setupEventHandlers() {
    // Tab switching
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab) switchTab(tab);
      });
    });

    // Manual Refresh
    document.getElementById('manualRefreshBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('manualRefreshBtn');
      btn.style.transform = 'rotate(180deg)';
      await refreshAllData();
      setTimeout(() => (btn.style.transform = 'none'), 400);
    });

    // Auto-refresh Select
    document.getElementById('autoRefreshSelect')?.addEventListener('change', (e) => {
      state.autoRefreshInterval = parseInt(e.target.value, 10);
      setupAutoRefresh();
    });

    // Export Dropdown
    const exportBtn = document.getElementById('exportMenuBtn');
    const exportDropdown = document.getElementById('exportDropdown');
    exportBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdown?.classList.toggle('show');
    });
    document.addEventListener('click', () => {
      exportDropdown?.classList.remove('show');
    });

    // User table filter pills
    document.querySelectorAll('[data-user-filter]').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('[data-user-filter]').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        state.userFilter = pill.dataset.userFilter;
        renderUsersTable();
      });
    });

    // Transaction filter pills
    document.querySelectorAll('[data-tx-source]').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('[data-tx-source]').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        state.txSourceFilter = pill.dataset.txSource;
        renderTransactionsTable();
      });
    });

    document.querySelectorAll('[data-tx-type]').forEach((pill) => {
      pill.addEventListener('click', () => {
        const isAlready = pill.classList.contains('active');
        document.querySelectorAll('[data-tx-type]').forEach((p) => p.classList.remove('active'));
        if (!isAlready) {
          pill.classList.add('active');
          state.txTypeFilter = pill.dataset.txType;
        } else {
          state.txTypeFilter = 'all';
        }
        renderTransactionsTable();
      });
    });

    // Global Search
    document.getElementById('globalSearchInput')?.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (!query) return;
      if (state.currentTab !== 'transactions' && state.currentTab !== 'users') {
        switchTab('transactions');
      }
      const txSearch = document.getElementById('txTableSearch');
      if (txSearch) txSearch.value = query;
      renderTransactionsTable();
    });

    // Table Search Inputs
    document.getElementById('userTableSearch')?.addEventListener('input', renderUsersTable);
    document.getElementById('txTableSearch')?.addEventListener('input', renderTransactionsTable);

    // Modal & Drawer Close
    document.getElementById('drawerCloseBtn')?.addEventListener('click', closeUserDrawer);
    document.getElementById('userDrawerOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'userDrawerOverlay') closeUserDrawer();
    });

    document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);
    document.getElementById('detailModalOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'detailModalOverlay') closeModal();
    });
  }

  // ── Switch Tabs ─────────────────────────────────────────────────
  function switchTab(tabId) {
    state.currentTab = tabId;

    // Update Nav
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update Panes
    document.querySelectorAll('.tab-pane').forEach((pane) => {
      pane.classList.remove('active');
    });
    const activePane = document.getElementById(`tab-${tabId}`);
    if (activePane) activePane.classList.add('active');

    // Update Page Title
    const titles = {
      overview: 'Operations Overview',
      voice: 'Voice Users & Speech Intelligence',
      users: 'Users CRM & Account Directory',
      transactions: 'Master Financial Ledger',
      receipts: 'Digital Receipts Hub',
      reports: 'Weekly Automated Dispatches',
      system: 'System Health & Observability',
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[tabId] || 'Admin Console';
  }

  // ── Auto Refresh Management ─────────────────────────────────────
  function setupAutoRefresh() {
    if (state.timerId) clearInterval(state.timerId);
    if (state.autoRefreshInterval > 0) {
      state.timerId = setInterval(() => {
        refreshAllData();
      }, state.autoRefreshInterval * 1000);
    }
  }

  // ── Refresh All Data ────────────────────────────────────────────
  async function refreshAllData() {
    const [overviewData, voiceData, usersData, txData, receiptsData, reportsData] =
      await Promise.all([
        fetchAPI('/overview'),
        fetchAPI('/voice-users'),
        fetchAPI('/users?limit=100'),
        fetchAPI('/transactions?limit=100'),
        fetchAPI('/receipts?limit=100'),
        fetchAPI('/reports?limit=100'),
      ]);

    // Handle Live vs Demo Fallback
    if (overviewData && overviewData.success) {
      state.overview = overviewData;
      state.voiceData = voiceData;
      state.users = usersData?.users || [];
      state.transactions = txData?.transactions || [];
      state.receipts = receiptsData?.receipts || [];
      state.reports = reportsData?.reports || [];
      updateDataPill(true);
    } else {
      // Offline fallback to rich demo data
      state.overview = mockData.overview;
      state.voiceData = mockData.voiceData;
      state.users = mockData.users;
      state.transactions = mockData.transactions;
      state.receipts = mockData.receipts;
      state.reports = mockData.reports;
      updateDataPill(false);
    }

    renderOverview();
    renderVoiceHub();
    renderUsersTable();
    renderTransactionsTable();
    renderReceiptsTable();
    renderReportsTable();
    renderSystemHealth();
  }

  function updateDataPill(isLive) {
    const pill = document.getElementById('dataModePill');
    const badge = document.getElementById('sidebarVoiceBadge');
    if (pill) {
      if (isLive) {
        pill.textContent = 'Live Database Connected';
        pill.parentElement.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      } else {
        pill.textContent = 'Demo Mode (Offline)';
        pill.parentElement.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      }
    }
    if (badge) {
      badge.textContent = isLive ? 'LIVE' : 'DEMO';
    }
  }

  // ── Render 1: Overview ──────────────────────────────────────────
  function renderOverview() {
    const m = state.overview.metrics;
    if (!m) return;

    // Badges & Counters
    setText('sidebarUserCount', m.users.total);
    setText('kpiTotalUsers', m.users.total);
    setText('kpiOnboardedUsers', m.users.onboardedCount);
    setText('kpiBusinessUsers', m.users.businessCount);

    setText('kpiVoiceUsers', m.users.activeVoiceUsersCount || m.users.voiceModeCount);
    setText('kpiVoiceModeUsers', m.users.voiceModeCount);
    setText('kpiVoiceShare', `${m.transactions.voicePercentage}%`);

    setText('kpiGrossVolume', formatMoney(m.transactions.totalIncome + m.transactions.totalExpense));
    setText('kpiTotalIncome', m.transactions.totalIncome.toLocaleString());
    setText('kpiTotalExpense', m.transactions.totalExpense.toLocaleString());
    setText('kpiNetBalance', formatMoney(m.transactions.netVolume));
    setText('kpiTotalTransactions', m.transactions.total);

    setText('kpiVoiceTransactions', m.transactions.voiceCount);
    setText('kpiTextTransactions', m.transactions.textCount);
    setText('kpiTotalReceipts', m.receipts.total);
    setText('kpiTotalReports', m.reports.total);

    // Voice Adoption Bar
    const voicePct = m.transactions.voicePercentage;
    const textPct = Math.max(0, 100 - voicePct);
    const fillVoice = document.getElementById('voiceProgressFill');
    const fillText = document.getElementById('textProgressFill');
    if (fillVoice) fillVoice.style.width = `${voicePct}%`;
    if (fillText) fillText.style.width = `${textPct}%`;

    setText('voiceAdoptionBadge', `${voicePct}% Voice`);
    setText('voiceLegendVal', `${m.transactions.voiceCount} notes (${voicePct}%)`);
    setText('textLegendVal', `${m.transactions.textCount} texts (${textPct}%)`);
    setText('vhVoiceModeUsers', `${m.users.voiceModeCount} users in voice reply mode`);

    // Top Categories
    renderOverviewCategories();

    // Recent Transactions stream in overview
    renderOverviewRecentTx();
  }

  function renderOverviewCategories() {
    const container = document.getElementById('overviewCategoryBars');
    if (!container) return;

    const topCats = state.voiceData?.summary?.topCategories || [
      { category: 'inventory', count: 12, totalAmount: 450000 },
      { category: 'fuel', count: 9, totalAmount: 180000 },
      { category: 'sales', count: 18, totalAmount: 820000 },
      { category: 'food', count: 7, totalAmount: 65000 },
    ];

    const maxAmt = Math.max(...topCats.map((c) => c.totalAmount || c.count * 10000), 1);

    container.innerHTML = topCats
      .slice(0, 5)
      .map((cat) => {
        const pct = Math.min(100, Math.round(((cat.totalAmount || 1000) / maxAmt) * 100));
        return `
        <div class="cat-bar-item">
          <div class="cat-bar-header">
            <span class="cat-name">${cat.category} (${cat.count} txs)</span>
            <span class="cat-amount">${formatMoney(cat.totalAmount || 0)}</span>
          </div>
          <div class="cat-bar-bg">
            <div class="cat-bar-fill" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  function renderOverviewRecentTx() {
    const tbody = document.getElementById('overviewRecentTxBody');
    if (!tbody) return;

    const list = state.transactions.slice(0, 6);
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center">No transactions recorded yet</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((tx) => {
        const isVoice = tx.source === 'voice';
        const u = tx.userId || {};
        const userName = u.name || u.phone || 'Anonymous';
        return `
        <tr>
          <td><span style="font-family:'JetBrains Mono'; font-size:11px;">${formatDate(tx.date)}</span></td>
          <td><strong>${userName}</strong></td>
          <td>
            <span class="badge-source ${isVoice ? 'voice' : 'text'}">
              ${isVoice ? '🎙️ Voice Note' : '💬 Text'}
            </span>
          </td>
          <td><span class="badge-type ${tx.type}">${tx.type}</span></td>
          <td><strong class="${tx.type === 'income' ? 'text-income' : 'text-expense'}">${formatMoney(tx.amount)}</strong></td>
          <td><span class="tag-pill">${tx.category}</span></td>
          <td style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${tx.transcript ? `<em style="color:#38bdf8;">"${tx.transcript}"</em>` : tx.description || '—'}
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="AdminApp.inspectTransaction('${tx._id}')">Inspect</button>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  // ── Render 2: Voice Users & Speech Hub ──────────────────────────
  function renderVoiceHub() {
    const s = state.voiceData?.summary;
    if (!s) return;

    setText('vbVoiceUsers', s.totalVoiceUsers);
    setText('vbVoiceVolume', formatMoney(s.totalVoiceVolume));
    setText('vbVoiceModeCount', s.usersInVoiceResponseMode);
    setText('voiceUserRosterCount', `${state.voiceData.voiceUsers?.length || 0} Voice Users`);

    // Voice Users Roster Table
    const vTable = document.getElementById('voiceUsersTableBody');
    const vUsers = state.voiceData.voiceUsers || [];
    if (vTable) {
      if (!vUsers.length) {
        vTable.innerHTML = `<tr><td colspan="7" class="text-center">No voice users registered yet</td></tr>`;
      } else {
        vTable.innerHTML = vUsers
          .map((u) => {
            const hasVoiceTxs = (u.voiceTxCount || u.metrics?.voiceTransactionCount || 0) > 0;
            return `
            <tr>
              <td>
                <strong>${u.name || 'Unnamed'}</strong>
                ${u.businessName ? `<br><small style="color:var(--text-subtle);">${u.businessName}</small>` : ''}
              </td>
              <td><span style="font-family:'JetBrains Mono';">${u.phone || u.whatsappId}</span></td>
              <td><span class="tag-pill">${u.profileType}</span></td>
              <td>
                <span class="badge-source ${u.responseMode === 'voice' ? 'voice' : 'text'}">
                  ${u.responseMode === 'voice' ? '🎙️ Voice Reply' : '💬 Text Reply'}
                </span>
              </td>
              <td>
                <strong class="cyan">${u.voiceTxCount || u.metrics?.voiceTransactionCount || 1} notes</strong>
              </td>
              <td>
                <span class="live-pill" style="padding:2px 8px; font-size:10px;">
                  <span class="pulse-dot"></span> Active Voice
                </span>
              </td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick="AdminApp.inspectUser('${u._id}')">
                  View Voice Profile
                </button>
              </td>
            </tr>
          `;
          })
          .join('');
      }
    }

    // AssemblyAI Transcripts Feed
    const tFeed = document.getElementById('transcriptsFeedList');
    const transcripts = state.voiceData.recentTranscripts || [];
    if (tFeed) {
      if (!transcripts.length) {
        tFeed.innerHTML = `<div class="empty-state-sm">No voice notes transcribed yet. Users can send voice notes to Monevo on WhatsApp.</div>`;
      } else {
        tFeed.innerHTML = transcripts
          .map((tx) => {
            const u = tx.userId || {};
            return `
            <div class="transcript-card">
              <div class="transcript-top">
                <div class="transcript-user-info">
                  <span class="badge-source voice">🎙️ AssemblyAI Decoded</span>
                  <span class="transcript-user-name">${u.name || 'WhatsApp User'}</span>
                  <span class="transcript-user-phone">${u.phone || ''}</span>
                </div>
                <span style="font-family:'JetBrains Mono'; font-size:11px; color:var(--text-subtle);">
                  ${formatDate(tx.date)}
                </span>
              </div>
              <div class="transcript-quote">
                "${tx.transcript || tx.description || 'Voice note processed'}"
              </div>
              <div class="transcript-meta">
                <span>Extracted Intent: <strong class="${tx.type === 'income' ? 'text-income' : 'text-expense'}">${tx.type?.toUpperCase()}</strong></span>
                <span>Amount: <strong>${formatMoney(tx.amount)}</strong></span>
                <span>Category: <span class="tag-pill">${tx.category}</span></span>
                ${u.businessName ? `<span>Merchant: <em>${u.businessName}</em></span>` : ''}
              </div>
            </div>
          `;
          })
          .join('');
      }
    }
  }

  // ── Render 3: Users CRM ─────────────────────────────────────────
  function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    const search = document.getElementById('userTableSearch')?.value.toLowerCase().trim() || '';

    // Filter
    let filtered = state.users.filter((u) => {
      if (state.userFilter === 'voice' && u.responseMode !== 'voice') return false;
      if (state.userFilter === 'business' && u.profileType !== 'business') return false;
      if (state.userFilter === 'personal' && u.profileType !== 'personal') return false;
      if (state.userFilter === 'onboarded' && !u.onboardingComplete) return false;

      if (search) {
        const matchesName = (u.name || '').toLowerCase().includes(search);
        const matchesPhone = (u.phone || u.whatsappId || '').toLowerCase().includes(search);
        const matchesBiz = (u.businessName || '').toLowerCase().includes(search);
        if (!matchesName && !matchesPhone && !matchesBiz) return false;
      }
      return true;
    });

    // Counts on filter pills
    setText('countAllUsers', state.users.length);
    setText('countVoiceUsers', state.users.filter((u) => u.responseMode === 'voice').length);
    setText('countBusinessUsers', state.users.filter((u) => u.profileType === 'business').length);
    setText('countPersonalUsers', state.users.filter((u) => u.profileType === 'personal').length);

    setText('userPaginationText', `Showing ${filtered.length} of ${state.users.length} registered users`);

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center">No users match filter criteria</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((u) => {
        const m = u.metrics || {};
        return `
        <tr>
          <td><strong>${u.name || 'Pending Name'}</strong></td>
          <td><span style="font-family:'JetBrains Mono';">${u.phone || u.whatsappId}</span></td>
          <td><span class="tag-pill">${u.profileType}</span></td>
          <td>${u.businessName || '<em style="color:var(--text-subtle);">None</em>'}</td>
          <td>
            <span class="badge-source ${u.responseMode === 'voice' ? 'voice' : 'text'}">
              ${u.responseMode === 'voice' ? '🎙️ Voice' : '💬 Text'}
            </span>
          </td>
          <td>${m.transactionCount || 0}</td>
          <td><strong class="cyan">${m.voiceTransactionCount || 0}</strong></td>
          <td>
            <span style="font-family:'JetBrains Mono'; font-weight:600; color:${(m.balance || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)'};">
              ${formatMoney(m.balance || 0)}
            </span>
          </td>
          <td>
            ${u.onboardingComplete ? '<span style="color:var(--accent-green);">✓ Done</span>' : '<span style="color:var(--accent-amber);">In Progress</span>'}
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="AdminApp.inspectUser('${u._id}')">Inspect</button>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  // ── Render 4: Transactions ──────────────────────────────────────
  function renderTransactionsTable() {
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;

    const search = document.getElementById('txTableSearch')?.value.toLowerCase().trim() || '';

    let filtered = state.transactions.filter((tx) => {
      if (state.txSourceFilter !== 'all' && tx.source !== state.txSourceFilter) return false;
      if (state.txTypeFilter !== 'all' && tx.type !== state.txTypeFilter) return false;

      if (search) {
        const matchesDesc = (tx.description || '').toLowerCase().includes(search);
        const matchesCat = (tx.category || '').toLowerCase().includes(search);
        const matchesTrans = (tx.transcript || '').toLowerCase().includes(search);
        const u = tx.userId || {};
        const matchesUser = (u.name || u.phone || '').toLowerCase().includes(search);
        if (!matchesDesc && !matchesCat && !matchesTrans && !matchesUser) return false;
      }
      return true;
    });

    setText('txPaginationText', `Showing ${filtered.length} of ${state.transactions.length} transactions`);

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center">No transactions match current filters</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((tx) => {
        const isVoice = tx.source === 'voice';
        const u = tx.userId || {};
        return `
        <tr>
          <td><span style="font-family:'JetBrains Mono'; font-size:11px;">${formatDate(tx.date)}</span></td>
          <td><strong>${u.name || u.phone || 'Anonymous'}</strong></td>
          <td><span class="badge-type ${tx.type}">${tx.type}</span></td>
          <td><strong class="${tx.type === 'income' ? 'text-income' : 'text-expense'}">${formatMoney(tx.amount)}</strong></td>
          <td>
            <span class="badge-source ${isVoice ? 'voice' : 'text'}">
              ${isVoice ? '🎙️ Voice' : '💬 Text'}
            </span>
          </td>
          <td><span class="tag-pill">${tx.category}</span></td>
          <td>${tx.description || '—'}</td>
          <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${tx.transcript ? `<span style="color:#38bdf8; font-style:italic;">"${tx.transcript}"</span>` : '—'}
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="AdminApp.inspectTransaction('${tx._id}')">View</button>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  // ── Render 5: Receipts ──────────────────────────────────────────
  function renderReceiptsTable() {
    const tbody = document.getElementById('receiptsTableBody');
    if (!tbody) return;

    setText('receiptsBadge', `${state.receipts.length} Receipts`);

    if (!state.receipts.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center">No receipts issued yet</td></tr>`;
      return;
    }

    tbody.innerHTML = state.receipts
      .map((r) => {
        const u = r.userId || {};
        return `
        <tr>
          <td><strong class="cyan" style="font-family:'JetBrains Mono';">${r.receiptNumber}</strong></td>
          <td><span style="font-family:'JetBrains Mono'; font-size:11px;">${formatDate(r.issuedAt)}</span></td>
          <td>${u.name || 'Customer'}</td>
          <td>${r.payer || '—'}</td>
          <td>${r.recipient || '—'}</td>
          <td><strong class="text-income">${formatMoney(r.amount, r.currency || '₦')}</strong></td>
          <td>${r.description || 'Receipt'}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="AdminApp.viewReceiptDetails('${r.receiptNumber}')">
              Preview Receipt
            </button>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  // ── Render 6: Weekly Reports ────────────────────────────────────
  function renderReportsTable() {
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) return;

    setText('reportsBadge', `${state.reports.length} Dispatched`);

    if (!state.reports.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center">No weekly reports dispatched yet</td></tr>`;
      return;
    }

    tbody.innerHTML = state.reports
      .map((rp) => {
        const u = rp.userId || {};
        const topSpend = (rp.topCategories || [])
          .map((c) => `${c.category}: ${formatMoney(c.amount)}`)
          .join(', ');
        return `
        <tr>
          <td>
            <span style="font-family:'JetBrains Mono'; font-size:11px;">
              ${new Date(rp.weekStart).toLocaleDateString('en-GB')} – ${new Date(rp.weekEnd).toLocaleDateString('en-GB')}
            </span>
          </td>
          <td><strong>${u.name || u.businessName || 'User'}</strong></td>
          <td><span class="text-income">${formatMoney(rp.totalIncome)}</span></td>
          <td><span class="text-expense">${formatMoney(rp.totalExpenses)}</span></td>
          <td>
            <strong style="color:${rp.net >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)'};">
              ${formatMoney(rp.net)}
            </strong>
          </td>
          <td>${rp.transactionCount || 0}</td>
          <td><small style="color:var(--text-muted);">${topSpend || 'None'}</small></td>
          <td><span style="font-family:'JetBrains Mono'; font-size:11px;">${formatDate(rp.generatedAt)}</span></td>
        </tr>
      `;
      })
      .join('');
  }

  // ── Render 7: System Health ─────────────────────────────────────
  function renderSystemHealth() {
    const sys = state.overview?.metrics?.system;
    if (!sys) return;

    setText('sysEnv', sys.nodeEnv);
    setText('sysNodeVer', sys.nodeVersion);
    setText('sysUptime', `${Math.floor(sys.uptimeSeconds / 60)} mins (${sys.uptimeSeconds}s)`);
    setText('sysMemory', `${sys.memoryHeapUsedMB} MB`);
    setText('sysDbStatus', sys.dbStatus === 'connected' ? 'Connected (Active)' : 'Degraded');
    setText('sysActiveConvs', `${sys.activeConversations} active flows`);

    const engineText = document.getElementById('engineStatusText');
    if (engineText) {
      engineText.textContent = `${sys.assemblyAiConfigured ? 'AssemblyAI Ready' : 'AssemblyAI Pending'} &bull; ${sys.metaConfigured ? 'Meta Active' : 'Meta Configured'}`;
    }
  }

  // ── User Slide-Over Drawer ──────────────────────────────────────
  async function inspectUser(userId) {
    const drawer = document.getElementById('userDrawerOverlay');
    const body = document.getElementById('drawerBody');
    if (!drawer || !body) return;

    drawer.classList.add('open');
    body.innerHTML = `<div class="empty-state-sm">Loading user profile and history...</div>`;

    let data = null;
    if (state.isLiveBackend) {
      data = await fetchAPI(`/users/${userId}`);
    }

    // Fallback if offline or API error
    if (!data || !data.user) {
      const u = state.users.find((x) => x._id === userId) || state.users[0];
      const userTxs = state.transactions.filter((t) => t.userId?.name === u.name);
      data = {
        user: u,
        transactions: userTxs,
        voiceTransactions: userTxs.filter((t) => t.source === 'voice'),
        receipts: state.receipts.filter((r) => r.userId?.name === u.name),
        weeklyReports: state.reports.filter((r) => r.userId?.name === u.name),
      };
    }

    const u = data.user;
    setText('drawerUserName', u.name || 'User Profile');
    setText('drawerUserPhone', u.phone || u.whatsappId);

    const m = u.metrics || {};

    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <!-- Profile Badges -->
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <span class="badge-source ${u.responseMode === 'voice' ? 'voice' : 'text'}">
            Response Mode: ${u.responseMode === 'voice' ? '🎙️ Voice Note' : '💬 Text'}
          </span>
          <span class="tag-pill">Profile: ${u.profileType}</span>
          ${u.businessName ? `<span class="card-badge purple">${u.businessName}</span>` : ''}
          <span class="tag-pill">Currency: ${u.currency || 'NGN'}</span>
        </div>

        <!-- Financial Mini Grid -->
        <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr); gap:12px; margin-bottom:0;">
          <div class="kpi-card" style="padding:14px;">
            <div class="kpi-title" style="font-size:10px;">Income</div>
            <div style="font-size:18px; font-weight:700; color:var(--accent-green); font-family:'JetBrains Mono';">
              ${formatMoney(m.income || m.incomeTotal || 0)}
            </div>
          </div>
          <div class="kpi-card" style="padding:14px;">
            <div class="kpi-title" style="font-size:10px;">Expense</div>
            <div style="font-size:18px; font-weight:700; color:var(--accent-rose); font-family:'JetBrains Mono';">
              ${formatMoney(m.expense || m.expenseTotal || 0)}
            </div>
          </div>
          <div class="kpi-card" style="padding:14px;">
            <div class="kpi-title" style="font-size:10px;">Balance</div>
            <div style="font-size:18px; font-weight:700; color:#fff; font-family:'JetBrains Mono';">
              ${formatMoney(m.balance || 0)}
            </div>
          </div>
        </div>

        <!-- Voice Notes Section -->
        <div class="glass-card" style="padding:16px;">
          <div class="card-title-group" style="margin-bottom:12px;">
            <h4 class="card-title" style="font-size:14px;">🎙️ Voice Transcripts (${data.voiceTransactions?.length || 0})</h4>
          </div>
          ${
            data.voiceTransactions?.length
              ? data.voiceTransactions
                  .map(
                    (v) => `
                <div style="padding:10px; background:rgba(0,0,0,0.25); border-left:2px solid var(--accent-cyan); border-radius:6px; margin-bottom:8px;">
                  <div style="font-size:13px; font-style:italic; color:#e2e8f0; margin-bottom:4px;">"${v.transcript || v.description}"</div>
                  <div style="font-size:11px; color:var(--text-subtle); display:flex; justify-content:space-between;">
                    <span>${formatMoney(v.amount)} &bull; ${v.category}</span>
                    <span>${formatDate(v.date)}</span>
                  </div>
                </div>
              `
                  )
                  .join('')
              : '<div class="empty-state-sm">No voice notes sent yet by this user.</div>'
          }
        </div>

        <!-- Recent Transactions -->
        <div class="glass-card" style="padding:16px;">
          <div class="card-title-group" style="margin-bottom:12px;">
            <h4 class="card-title" style="font-size:14px;">Transaction Ledger (${data.transactions?.length || 0})</h4>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${
              data.transactions?.length
                ? data.transactions
                    .slice(0, 10)
                    .map(
                      (t) => `
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
                    <div>
                      <div style="font-weight:600; font-size:13px;">${t.description || t.category}</div>
                      <div style="font-size:11px; color:var(--text-subtle);">
                        ${t.source === 'voice' ? '🎙️ Voice Note' : '💬 Text'} &bull; ${formatDate(t.date)}
                      </div>
                    </div>
                    <div class="${t.type === 'income' ? 'text-income' : 'text-expense'}" style="font-size:14px;">
                      ${t.type === 'income' ? '+' : '-'}${formatMoney(t.amount)}
                    </div>
                  </div>
                `
                    )
                    .join('')
                : '<div class="empty-state-sm">No transactions found</div>'
            }
          </div>
        </div>
      </div>
    `;
  }

  function closeUserDrawer() {
    document.getElementById('userDrawerOverlay')?.classList.remove('open');
  }

  // ── Modal Inspections ───────────────────────────────────────────
  function inspectTransaction(txId) {
    const tx = state.transactions.find((t) => t._id === txId);
    if (!tx) return;

    openModal('Transaction Inspection', `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="badge-type ${tx.type}" style="font-size:13px; padding:4px 12px;">${tx.type?.toUpperCase()}</span>
          <span style="font-size:24px; font-weight:800; font-family:'JetBrains Mono';" class="${tx.type === 'income' ? 'text-income' : 'text-expense'}">
            ${formatMoney(tx.amount)}
          </span>
        </div>

        <div class="spec-list" style="margin-top:10px;">
          <div class="spec-item"><span class="spec-label">User</span><span class="spec-val">${tx.userId?.name || 'Anonymous'}</span></div>
          <div class="spec-item"><span class="spec-label">Source</span><span class="spec-val">${tx.source === 'voice' ? '🎙️ Voice Note (AssemblyAI STT)' : '💬 Text Message'}</span></div>
          <div class="spec-item"><span class="spec-label">Category</span><span class="spec-val" style="text-transform:capitalize;">${tx.category}</span></div>
          <div class="spec-item"><span class="spec-label">Date & Time</span><span class="spec-val">${formatDate(tx.date)}</span></div>
          <div class="spec-item"><span class="spec-label">Description</span><span class="spec-val">${tx.description || '—'}</span></div>
        </div>

        ${
          tx.transcript
            ? `
          <div style="background:rgba(6,182,212,0.08); border:1px solid rgba(6,182,212,0.3); border-radius:8px; padding:14px;">
            <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--accent-cyan); margin-bottom:6px;">
              🎙️ AssemblyAI Audio Transcript
            </div>
            <div style="font-size:14px; font-style:italic; color:#fff;">"${tx.transcript}"</div>
          </div>
        `
            : ''
        }
      </div>
    `);
  }

  function viewReceiptDetails(receiptNumber) {
    const r = state.receipts.find((x) => x.receiptNumber === receiptNumber);
    if (!r) return;

    openModal(`Official Receipt #${r.receiptNumber}`, `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div style="text-align:center; padding:16px; background:rgba(255,255,255,0.03); border:1px dashed var(--border-subtle); border-radius:8px;">
          <div style="font-size:12px; color:var(--text-subtle); text-transform:uppercase; letter-spacing:0.08em;">Official Monevo Receipt</div>
          <div style="font-size:26px; font-weight:800; color:var(--accent-green); margin:8px 0; font-family:'JetBrains Mono';">
            ${formatMoney(r.amount, r.currency || '₦')}
          </div>
          <div style="font-size:13px; color:#fff;">${r.description || 'Payment Transaction'}</div>
        </div>

        <div class="spec-list">
          <div class="spec-item"><span class="spec-label">Receipt Number</span><span class="spec-val cyan">${r.receiptNumber}</span></div>
          <div class="spec-item"><span class="spec-label">Payer</span><span class="spec-val">${r.payer || '—'}</span></div>
          <div class="spec-item"><span class="spec-label">Recipient</span><span class="spec-val">${r.recipient || '—'}</span></div>
          <div class="spec-item"><span class="spec-label">Date Issued</span><span class="spec-val">${formatDate(r.issuedAt)}</span></div>
        </div>
      </div>
    `);
  }

  function openModal(title, contentHtml) {
    const modal = document.getElementById('detailModalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    if (!modal || !titleEl || !bodyEl) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = contentHtml;
    modal.classList.add('open');
  }

  function closeModal() {
    document.getElementById('detailModalOverlay')?.classList.remove('open');
  }

  // ── CSV Data Export ─────────────────────────────────────────────
  function exportData(type) {
    if (state.isLiveBackend) {
      window.location.href = `/api/admin/export?type=${type}`;
      return;
    }

    // Standalone fallback: build CSV in browser and trigger instant download
    let headers = [];
    let rows = [];
    let filename = `monevo-${type}.csv`;

    if (type === 'transactions') {
      headers = ['Date', 'User', 'Type', 'Amount', 'Source', 'Category', 'Description', 'Transcript'];
      rows = state.transactions.map((t) => [
        t.date,
        `"${t.userId?.name || ''}"`,
        t.type,
        t.amount,
        t.source,
        t.category,
        `"${(t.description || '').replace(/"/g, '""')}"`,
        `"${(t.transcript || '').replace(/"/g, '""')}"`,
      ]);
    } else if (type === 'voice-logs') {
      headers = ['Date', 'User', 'Phone', 'Amount', 'Category', 'Voice Transcript'];
      const voiceTxs = state.transactions.filter((t) => t.source === 'voice');
      rows = voiceTxs.map((t) => [
        t.date,
        `"${t.userId?.name || ''}"`,
        `"${t.userId?.phone || ''}"`,
        t.amount,
        t.category,
        `"${(t.transcript || '').replace(/"/g, '""')}"`,
      ]);
    } else {
      headers = ['Name', 'Phone', 'Profile Type', 'Business Name', 'Response Mode', 'Onboarding Complete'];
      rows = state.users.map((u) => [
        `"${u.name || ''}"`,
        `"${u.phone || u.whatsappId || ''}"`,
        u.profileType,
        `"${(u.businessName || '').replace(/"/g, '""')}"`,
        u.responseMode,
        u.onboardingComplete ? 'Yes' : 'No',
      ]);
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function clearEventLogs() {
    const el = document.getElementById('eventLogsTerminal');
    if (el) {
      el.innerHTML = `
        <div class="log-entry log-info">
          <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
          <span class="log-msg">Event feed cleared. Telemetry online.</span>
        </div>
      `;
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Public API
  return {
    init,
    switchTab,
    inspectUser,
    inspectTransaction,
    viewReceiptDetails,
    exportData,
    clearEventLogs,
  };
})();

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  AdminApp.init();
});
