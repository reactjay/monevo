import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { User, IUserDocument } from '../models/User';
import { Transaction } from '../models/Transaction';
import { Receipt } from '../models/Receipt';
import { WeeklyReport } from '../models/WeeklyReport';
import { ConversationState } from '../models/ConversationState';
import { env } from '../config/env';

/**
 * Helper to build user match query for filters
 */
function buildUserFilter(query: Request['query']) {
  const filter: Record<string, unknown> = {};

  if (query.responseMode && (query.responseMode === 'voice' || query.responseMode === 'text')) {
    filter.responseMode = query.responseMode;
  }

  if (query.profileType && (query.profileType === 'personal' || query.profileType === 'business')) {
    filter.profileType = query.profileType;
  }

  if (query.onboardingComplete !== undefined && query.onboardingComplete !== '') {
    filter.onboardingComplete = query.onboardingComplete === 'true';
  }

  if (query.search && typeof query.search === 'string') {
    const s = query.search.trim();
    if (s) {
      filter.$or = [
        { name: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { whatsappId: { $regex: s, $options: 'i' } },
        { businessName: { $regex: s, $options: 'i' } },
      ];
    }
  }

  return filter;
}

/**
 * GET /api/admin/overview
 * High-level KPIs and vital metrics across users, voice adoption, finance, and system.
 */
export async function getAdminOverview(_req: Request, res: Response): Promise<void> {
  try {
    const [
      totalUsers,
      voiceResponseUsers,
      textResponseUsers,
      businessUsers,
      personalUsers,
      onboardedUsers,
      totalTransactions,
      voiceTransactions,
      textTransactions,
      totalReceipts,
      totalReports,
      activeConversations,
      financialAgg,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ responseMode: 'voice' }),
      User.countDocuments({ responseMode: 'text' }),
      User.countDocuments({ profileType: 'business' }),
      User.countDocuments({ profileType: 'personal' }),
      User.countDocuments({ onboardingComplete: true }),
      Transaction.countDocuments(),
      Transaction.countDocuments({ source: 'voice' }),
      Transaction.countDocuments({ source: 'text' }),
      Receipt.countDocuments(),
      WeeklyReport.countDocuments(),
      ConversationState.countDocuments(),
      Transaction.aggregate([
        {
          $group: {
            _id: '$type',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Aggregate users who have logged voice transactions
    const voiceDistinctUsers = await Transaction.distinct('userId', { source: 'voice' });
    const allVoiceUserIds = new Set(voiceDistinctUsers.map((id) => id.toString()));

    let totalIncome = 0;
    let totalExpense = 0;
    for (const item of financialAgg) {
      if (item._id === 'income') totalIncome = item.totalAmount;
      if (item._id === 'expense') totalExpense = item.totalAmount;
    }

    const netVolume = totalIncome - totalExpense;
    const voicePercentage =
      totalTransactions > 0 ? Math.round((voiceTransactions / totalTransactions) * 1000) / 10 : 0;

    const memory = process.memoryUsage();

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      metrics: {
        users: {
          total: totalUsers,
          voiceModeCount: voiceResponseUsers,
          textModeCount: textResponseUsers,
          activeVoiceUsersCount: allVoiceUserIds.size,
          businessCount: businessUsers,
          personalCount: personalUsers,
          onboardedCount: onboardedUsers,
          pendingOnboarding: totalUsers - onboardedUsers,
        },
        transactions: {
          total: totalTransactions,
          voiceCount: voiceTransactions,
          textCount: textTransactions,
          voicePercentage,
          totalIncome,
          totalExpense,
          netVolume,
          currency: 'NGN',
        },
        receipts: {
          total: totalReceipts,
        },
        reports: {
          total: totalReports,
        },
        system: {
          nodeEnv: env.NODE_ENV,
          nodeVersion: process.version,
          uptimeSeconds: Math.floor(process.uptime()),
          dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
          activeConversations,
          memoryHeapUsedMB: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
          assemblyAiConfigured: Boolean(env.ASSEMBLYAI_API_KEY),
          metaConfigured: Boolean(env.META_WHATSAPP_ACCESS_TOKEN || env.KAPSO_API_KEY),
        },
      },
    });
  } catch (error) {
    console.error('[Admin] getAdminOverview error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve overview metrics' });
  }
}

/**
 * GET /api/admin/users
 * Searchable, filterable users list with computed transaction & voice summaries.
 */
export async function getAdminUsers(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10)));
    const skip = (page - 1) * limit;

    const filter = buildUserFilter(req.query);

    const [users, totalCount] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    // Attach transaction summaries per user
    const userIds = users.map((u) => u._id);
    const txAggregations = await Transaction.aggregate([
      { $match: { userId: { $in: userIds } } },
      {
        $group: {
          _id: '$userId',
          totalCount: { $sum: 1 },
          voiceCount: {
            $sum: { $cond: [{ $eq: ['$source', 'voice'] }, 1, 0] },
          },
          textCount: {
            $sum: { $cond: [{ $eq: ['$source', 'text'] }, 1, 0] },
          },
          incomeTotal: {
            $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] },
          },
          expenseTotal: {
            $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] },
          },
          lastTxDate: { $max: '$date' },
        },
      },
    ]);

    const txMap = new Map<string, (typeof txAggregations)[0]>();
    for (const agg of txAggregations) {
      txMap.set(agg._id.toString(), agg);
    }

    const enhancedUsers = users.map((u) => {
      const stats = txMap.get(u._id.toString());
      const income = stats?.incomeTotal || 0;
      const expense = stats?.expenseTotal || 0;
      return {
        ...u,
        metrics: {
          transactionCount: stats?.totalCount || 0,
          voiceTransactionCount: stats?.voiceCount || 0,
          textTransactionCount: stats?.textCount || 0,
          income,
          expense,
          balance: income - expense,
          lastActive: stats?.lastTxDate || u.updatedAt || u.createdAt,
        },
      };
    });

    res.status(200).json({
      success: true,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      users: enhancedUsers,
    });
  } catch (error) {
    console.error('[Admin] getAdminUsers error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve users' });
  }
}

/**
 * GET /api/admin/users/:id
 * Full single-user deep dive (profile, metrics, recent transactions, receipts, voice logs).
 */
export async function getAdminUserDetails(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid user ID' });
      return;
    }

    const user = await User.findById(id).lean();
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const [transactions, receipts, weeklyReports, conversationState] = await Promise.all([
      Transaction.find({ userId: id }).sort({ date: -1 }).limit(100).lean(),
      Receipt.find({ userId: id }).sort({ issuedAt: -1 }).limit(20).lean(),
      WeeklyReport.find({ userId: id }).sort({ weekStart: -1 }).limit(10).lean(),
      ConversationState.findOne({ whatsappId: user.whatsappId }).lean(),
    ]);

    const voiceTransactions = transactions.filter((t) => t.source === 'voice');
    const incomeTotal = transactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenseTotal = transactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    res.status(200).json({
      success: true,
      user: {
        ...user,
        metrics: {
          totalTransactions: transactions.length,
          voiceTransactionsCount: voiceTransactions.length,
          textTransactionsCount: transactions.length - voiceTransactions.length,
          incomeTotal,
          expenseTotal,
          balance: incomeTotal - expenseTotal,
        },
      },
      transactions,
      voiceTransactions,
      receipts,
      weeklyReports,
      conversationState,
    });
  } catch (error) {
    console.error('[Admin] getAdminUserDetails error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve user details' });
  }
}

/**
 * GET /api/admin/voice-users
 * Dedicated Voice Intelligence endpoint tracking all voice-active users, AssemblyAI transcripts,
 * voice transaction volume, and speech-to-text accuracy logs.
 */
export async function getAdminVoiceIntelligence(_req: Request, res: Response): Promise<void> {
  try {
    // 1. Voice Users: users with responseMode === 'voice' OR who logged voice transactions
    const voiceModeUsers = await User.find({ responseMode: 'voice' }).lean();
    const voiceTxUserIds = await Transaction.distinct('userId', { source: 'voice' });
    const allVoiceIds = Array.from(
      new Set([...voiceModeUsers.map((u) => u._id.toString()), ...voiceTxUserIds.map((id) => id.toString())])
    );

    const fullVoiceUsers = await User.find({ _id: { $in: allVoiceIds } }).lean();

    // 2. Aggregate voice transactions metrics
    const [voiceTxSummary, topVoiceCategoriesAgg, recentVoiceTranscripts] = await Promise.all([
      Transaction.aggregate([
        { $match: { source: 'voice' } },
        {
          $group: {
            _id: '$type',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
            avgAmount: { $avg: '$amount' },
          },
        },
      ]),
      Transaction.aggregate([
        { $match: { source: 'voice' } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      Transaction.find({ source: 'voice' })
        .sort({ date: -1 })
        .limit(50)
        .populate('userId', 'name phone whatsappId profileType businessName')
        .lean(),
    ]);

    let voiceIncomeTotal = 0;
    let voiceExpenseTotal = 0;
    let voiceIncomeCount = 0;
    let voiceExpenseCount = 0;

    for (const item of voiceTxSummary) {
      if (item._id === 'income') {
        voiceIncomeTotal = item.totalAmount;
        voiceIncomeCount = item.count;
      }
      if (item._id === 'expense') {
        voiceExpenseTotal = item.totalAmount;
        voiceExpenseCount = item.count;
      }
    }

    const totalVoiceTxCount = voiceIncomeCount + voiceExpenseCount;
    const totalVoiceVolume = voiceIncomeTotal + voiceExpenseTotal;

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalVoiceUsers: fullVoiceUsers.length,
        usersInVoiceResponseMode: voiceModeUsers.length,
        totalVoiceTransactions: totalVoiceTxCount,
        totalVoiceVolume,
        voiceIncomeTotal,
        voiceExpenseTotal,
        topCategories: topVoiceCategoriesAgg.map((c) => ({
          category: c._id || 'other',
          count: c.count,
          totalAmount: c.totalAmount,
        })),
        assemblyAiEngine: {
          provider: 'AssemblyAI Universal Speech-to-Text',
          configured: Boolean(env.ASSEMBLYAI_API_KEY),
          languageModel: 'Multilingual / African English & Pidgin Optimized',
          ttsEngine: 'Microsoft Edge Neural TTS / Google TTS Fallback',
        },
      },
      voiceUsers: fullVoiceUsers,
      recentTranscripts: recentVoiceTranscripts,
    });
  } catch (error) {
    console.error('[Admin] getAdminVoiceIntelligence error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve voice intelligence' });
  }
}

/**
 * GET /api/admin/transactions
 * Comprehensive ledger with filters for voice notes, text, income, expense, and search.
 */
export async function getAdminTransactions(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (req.query.source && (req.query.source === 'voice' || req.query.source === 'text')) {
      filter.source = req.query.source;
    }

    if (req.query.type && (req.query.type === 'income' || req.query.type === 'expense')) {
      filter.type = req.query.type;
    }

    if (req.query.category && typeof req.query.category === 'string') {
      filter.category = req.query.category.toLowerCase().trim();
    }

    if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
      filter.userId = req.query.userId;
    }

    if (req.query.search && typeof req.query.search === 'string') {
      const s = req.query.search.trim();
      filter.$or = [
        { description: { $regex: s, $options: 'i' } },
        { counterparty: { $regex: s, $options: 'i' } },
        { category: { $regex: s, $options: 'i' } },
        { transcript: { $regex: s, $options: 'i' } },
      ];
    }

    const [transactions, totalCount] = await Promise.all([
      Transaction.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name phone whatsappId profileType businessName responseMode')
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      transactions,
    });
  } catch (error) {
    console.error('[Admin] getAdminTransactions error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve transactions' });
  }
}

/**
 * GET /api/admin/receipts
 * Digital receipts list with user details.
 */
export async function getAdminReceipts(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (req.query.search && typeof req.query.search === 'string') {
      const s = req.query.search.trim();
      filter.$or = [
        { receiptNumber: { $regex: s, $options: 'i' } },
        { payer: { $regex: s, $options: 'i' } },
        { recipient: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
      ];
    }

    const [receipts, totalCount] = await Promise.all([
      Receipt.find(filter)
        .sort({ issuedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name phone whatsappId profileType businessName')
        .populate('transactionId')
        .lean(),
      Receipt.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      receipts,
    });
  } catch (error) {
    console.error('[Admin] getAdminReceipts error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve receipts' });
  }
}

/**
 * GET /api/admin/reports
 * Weekly financial reports dispatched to users.
 */
export async function getAdminReports(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10)));
    const skip = (page - 1) * limit;

    const [reports, totalCount] = await Promise.all([
      WeeklyReport.find()
        .sort({ generatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name phone whatsappId profileType businessName')
        .lean(),
      WeeklyReport.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      reports,
    });
  } catch (error) {
    console.error('[Admin] getAdminReports error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve weekly reports' });
  }
}

/**
 * GET /api/admin/analytics
 * Time-series trend analytics for income vs expense and voice vs text message distribution.
 */
export async function getAdminAnalytics(_req: Request, res: Response): Promise<void> {
  try {
    // 14-day history
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const [timelineAgg, categoryAgg, sourceAgg] = await Promise.all([
      Transaction.aggregate([
        { $match: { date: { $gte: fourteenDaysAgo } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
              type: '$type',
              source: '$source',
            },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]),
      Transaction.aggregate([
        {
          $group: {
            _id: { category: '$category', type: '$type' },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalAmount: -1 } },
        { $limit: 10 },
      ]),
      Transaction.aggregate([
        {
          $group: {
            _id: '$source',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    res.status(200).json({
      success: true,
      timeline: timelineAgg,
      categories: categoryAgg,
      sources: sourceAgg,
    });
  } catch (error) {
    console.error('[Admin] getAdminAnalytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve analytics' });
  }
}

/**
 * GET /api/admin/export
 * Exports users or transactions as a downloadable CSV.
 */
export async function exportAdminData(req: Request, res: Response): Promise<void> {
  try {
    const type = req.query.type || 'transactions';

    if (type === 'users') {
      const users = await User.find().sort({ createdAt: -1 }).lean();
      const headers = [
        'WhatsApp ID',
        'Name',
        'Phone',
        'Profile Type',
        'Business Name',
        'Currency',
        'Response Mode',
        'Onboarding Complete',
        'Created At',
      ];
      const rows = users.map((u) => [
        `"${u.whatsappId || ''}"`,
        `"${(u.name || '').replace(/"/g, '""')}"`,
        `"${u.phone || ''}"`,
        `"${u.profileType || ''}"`,
        `"${(u.businessName || '').replace(/"/g, '""')}"`,
        `"${u.currency || 'NGN'}"`,
        `"${u.responseMode || 'text'}"`,
        `"${u.onboardingComplete ? 'Yes' : 'No'}"`,
        `"${new Date(u.createdAt).toISOString()}"`,
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="monevo-users.csv"');
      res.status(200).send(csv);
      return;
    }

    if (type === 'voice-logs') {
      const voiceTx = await Transaction.find({ source: 'voice' })
        .sort({ date: -1 })
        .populate('userId', 'name whatsappId')
        .lean();

      const headers = [
        'Date',
        'User Name',
        'WhatsApp ID',
        'Type',
        'Amount',
        'Category',
        'Description',
        'Voice Transcript',
      ];

      const rows = voiceTx.map((t) => {
        const u = t.userId as unknown as IUserDocument;
        return [
          `"${new Date(t.date).toISOString()}"`,
          `"${(u?.name || 'Unknown').replace(/"/g, '""')}"`,
          `"${u?.whatsappId || ''}"`,
          `"${t.type}"`,
          `"${t.amount}"`,
          `"${t.category}"`,
          `"${(t.description || '').replace(/"/g, '""')}"`,
          `"${(t.transcript || '').replace(/"/g, '""')}"`,
        ];
      });

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="monevo-voice-transcripts.csv"');
      res.status(200).send(csv);
      return;
    }

    // Default: Transactions
    const txs = await Transaction.find()
      .sort({ date: -1 })
      .populate('userId', 'name whatsappId')
      .lean();

    const headers = [
      'Date',
      'User Name',
      'WhatsApp ID',
      'Type',
      'Amount',
      'Currency',
      'Category',
      'Source',
      'Description',
      'Counterparty',
      'Voice Transcript',
    ];

    const rows = txs.map((t) => {
      const u = t.userId as unknown as IUserDocument;
      return [
        `"${new Date(t.date).toISOString()}"`,
        `"${(u?.name || 'Unknown').replace(/"/g, '""')}"`,
        `"${u?.whatsappId || ''}"`,
        `"${t.type}"`,
        `"${t.amount}"`,
        `"${t.currency}"`,
        `"${t.category}"`,
        `"${t.source}"`,
        `"${(t.description || '').replace(/"/g, '""')}"`,
        `"${(t.counterparty || '').replace(/"/g, '""')}"`,
        `"${(t.transcript || '').replace(/"/g, '""')}"`,
      ];
    });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="monevo-transactions.csv"');
    res.status(200).send(csv);
  } catch (error) {
    console.error('[Admin] exportAdminData error:', error);
    res.status(500).json({ success: false, error: 'Failed to export data' });
  }
}
