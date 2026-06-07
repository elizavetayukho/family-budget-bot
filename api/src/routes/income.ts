import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Used during onboarding to set both brutto and netto for the current month directly
router.post('/setup', requireAuth, requireAdmin, async (req, res) => {
  const { userId, brutto, netto, month } = req.body;
  const m = month || currentMonth();
  const record = await prisma.income.upsert({
    where: { userId_month: { userId: Number(userId), month: m } },
    update: { brutto, ...(netto != null ? { netto } : {}) },
    create: { userId: Number(userId), month: m, brutto, netto: netto ?? null },
  });
  res.json(record);
});

router.post('/netto', requireAuth, async (req, res) => {
  const { month, netto, userId } = req.body;
  const isAdmin = req.user!.role === 'ADMIN';
  const targetId = userId && isAdmin ? Number(userId) : req.user!.id;
  const m = month || currentMonth();

  const record = await prisma.income.upsert({
    where: { userId_month: { userId: targetId, month: m } },
    update: { netto },
    create: {
      userId: targetId,
      month: m,
      brutto: 0,
      netto,
    },
  });

  res.json(record);
});

router.get('/history/:userId', requireAuth, async (req, res) => {
  const targetId = Number(req.params.userId);
  if (targetId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const incomes = await prisma.income.findMany({
    where: { userId: targetId },
    orderBy: { month: 'desc' },
  });

  res.json(incomes);
});

router.post('/brutto', requireAuth, requireAdmin, async (req, res) => {
  const { userId, newBrutto, reason } = req.body;
  const effectiveMonth = nextMonth();

  const existing = await prisma.income.findUnique({
    where: { userId_month: { userId, month: effectiveMonth } },
  });

  const historyEntry = {
    previousValue: existing?.brutto ?? null,
    newValue: newBrutto,
    effectiveDate: `${effectiveMonth}-01`,
    reason: reason || null,
  };

  const currentHistory = Array.isArray(existing?.bruttoHistory) ? existing!.bruttoHistory as object[] : [];

  await prisma.income.upsert({
    where: { userId_month: { userId, month: effectiveMonth } },
    update: {
      brutto: newBrutto,
      bruttoHistory: [...currentHistory, historyEntry],
    },
    create: {
      userId,
      month: effectiveMonth,
      brutto: newBrutto,
      bruttoHistory: [historyEntry],
    },
  });

  res.json({ ok: true, effectiveMonth });
});

export default router;
