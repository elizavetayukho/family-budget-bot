import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { runMonthlyReset, recalculatePersonCarryForwards } from '../jobs/monthlyReset';

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

// Recompute per-person carry-forwards for a given closing month (safe to re-run, no notifications)
router.post('/recalculate-carries', requireAuth, requireAdmin, async (req, res) => {
  const { closingMonth } = req.body;
  if (!closingMonth || !/^\d{4}-\d{2}$/.test(closingMonth)) {
    return res.status(400).json({ error: 'closingMonth required (YYYY-MM)' });
  }
  try {
    await recalculatePersonCarryForwards(closingMonth);
    res.json({ ok: true, closingMonth });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Recalculate failed', detail: String(e) });
  }
});

export default router;
