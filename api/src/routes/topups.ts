import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/top-ups?jarId=X&month=YYYY-MM
router.get('/', requireAuth, async (req, res) => {
  const jarId = req.query.jarId ? Number(req.query.jarId) : undefined;
  const month = req.query.month as string | undefined;

  const where: Record<string, unknown> = {};
  if (jarId) where.jarId = jarId;
  if (month) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(new Date(start).setMonth(start.getMonth() + 1));
    where.date = { gte: start, lt: end };
  }

  const topUps = await prisma.jarTopUp.findMany({
    where,
    include: { user: { select: { id: true, name: true } } },
    orderBy: { date: 'desc' },
  });
  res.json(topUps);
});

// POST /api/top-ups  { jarId, amountPln, note?, userId? (admin only) }
router.post('/', requireAuth, async (req, res) => {
  const me = (req as any).user;
  const { jarId, amountPln, note, userId } = req.body;

  if (!jarId || !amountPln || Number(amountPln) <= 0) {
    return res.status(400).json({ error: 'jarId and positive amountPln required' });
  }

  // Admin can add on behalf of any user; regular user only for themselves
  const targetUserId = me.role === 'ADMIN' && userId ? Number(userId) : me.id;

  const topUp = await prisma.jarTopUp.create({
    data: {
      userId: targetUserId,
      jarId: Number(jarId),
      amountPln: Number(amountPln),
      note: note || null,
      date: new Date(),
    },
    include: { user: { select: { id: true, name: true } } },
  });
  res.json(topUp);
});

// DELETE /api/top-ups/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const me = (req as any).user;
  const topUp = await prisma.jarTopUp.findUnique({ where: { id: Number(req.params.id) } });
  if (!topUp) return res.status(404).json({ error: 'Not found' });
  if (topUp.userId !== me.id && me.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await prisma.jarTopUp.delete({ where: { id: topUp.id } });
  res.json({ ok: true });
});

export default router;
