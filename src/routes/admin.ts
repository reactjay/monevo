import { Router } from 'express';
import {
  getAdminOverview,
  getAdminUsers,
  getAdminUserDetails,
  getAdminVoiceIntelligence,
  getAdminTransactions,
  getAdminReceipts,
  getAdminReports,
  getAdminAnalytics,
  exportAdminData,
} from '../controllers/adminController';

const router = Router();

// High-level overview & KPI counters
router.get('/overview', getAdminOverview);

// User CRM & roster
router.get('/users', getAdminUsers);
router.get('/users/:id', getAdminUserDetails);

// Dedicated Voice Intelligence Hub
router.get('/voice-users', getAdminVoiceIntelligence);

// Transactions Ledger
router.get('/transactions', getAdminTransactions);

// Receipts & Weekly Reports
router.get('/receipts', getAdminReceipts);
router.get('/reports', getAdminReports);

// Analytics & Trends
router.get('/analytics', getAdminAnalytics);

// Data Export (CSV)
router.get('/export', exportAdminData);

export { router as adminRouter };
