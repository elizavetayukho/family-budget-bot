import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { runMonthlyReset } from '../jobs/monthlyReset';

const router = Router();

// Manual trigger for testing the monthly reset
router.post('/trigger-reset', requireAuth, requireAdmin, async (_req, res) => {
  try {
    await runMonthlyReset();
    res.json({ ok: true, message: 'Monthly reset complete' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Reset failed', detail: String(e) });
  }
});

export default router;
