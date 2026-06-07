import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, async (req, res) => {
  // Reuse expenses route logic — redirect to expenses
  req.url = '/';
  res.redirect(307, `/api/expenses${req.url === '/' ? '' : req.url}?${new URLSearchParams(req.query as Record<string, string>)}`);
});

router.get('/snapshots', requireAuth, async (_req, res) => {
  const snapshots = await prisma.monthlySnapshot.findMany({
    orderBy: { month: 'desc' },
    select: { id: true, month: true, createdAt: true },
  });
  res.json(snapshots);
});

router.get('/snapshots/:month', requireAuth, async (req, res) => {
  const snapshot = await prisma.monthlySnapshot.findUnique({
    where: { month: req.params.month },
  });
  if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });

  res.json(snapshot);
});

export default router;
