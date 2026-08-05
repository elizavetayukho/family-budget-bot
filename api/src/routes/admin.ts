import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { runMonthlyReset, recalculatePersonCarryForwards } from '../jobs/monthlyReset';

const prisma = new PrismaClient();

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

// Manually set a per-person carry-forward (opening balance) for a jar × user × month
router.post('/set-carry-forward', requireAuth, requireAdmin, async (req, res) => {
  const { userId, jarId, month, amount } = req.body;
  if (!userId || !jarId || !month || amount === undefined) {
    return res.status(400).json({ error: 'userId, jarId, month, amount required' });
  }
  try {
    const record = await prisma.jarPersonCarryForward.upsert({
      where: { userId_jarId_month: { userId: Number(userId), jarId: Number(jarId), month } },
      update: { amount: Number(amount) },
      create: { userId: Number(userId), jarId: Number(jarId), month, amount: Number(amount) },
    });
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Get current carry-forwards for a given month
router.get('/carry-forwards/:month', requireAuth, requireAdmin, async (req, res) => {
  const records = await prisma.jarPersonCarryForward.findMany({
    where: { month: req.params.month },
    include: { user: { select: { id: true, name: true } }, jar: { select: { id: true, name: true } } },
  });
  res.json(records);
});

export default router;
