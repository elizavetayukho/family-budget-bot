import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.post('/', requireAuth, async (req, res) => {
  const { toUserId, jarId, amountPln, note } = req.body;
  if (!toUserId || !jarId || !amountPln || amountPln <= 0) {
    return res.status(400).json({ error: 'toUserId, jarId and a positive amountPln are required' });
  }
  if (Number(toUserId) === req.user!.id) {
    return res.status(400).json({ error: 'Cannot transfer to yourself' });
  }

  const transfer = await prisma.jarTransfer.create({
    data: {
      fromUserId: req.user!.id,
      toUserId: Number(toUserId),
      jarId: Number(jarId),
      amountPln: Number(amountPln),
      note: note || null,
    },
    include: {
      fromUser: { select: { id: true, name: true } },
      toUser: { select: { id: true, name: true } },
      jar: { select: { id: true, name: true } },
    },
  });

  res.status(201).json(transfer);
});

router.get('/', requireAuth, async (req, res) => {
  const { jarId, month } = req.query;
  const userId = req.user!.id;

  const where: Record<string, unknown> = {
    OR: [{ fromUserId: userId }, { toUserId: userId }],
  };

  if (jarId) where.jarId = Number(jarId);

  if (month) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(new Date(start).setMonth(start.getMonth() + 1));
    where.date = { gte: start, lt: end };
  }

  const transfers = await prisma.jarTransfer.findMany({
    where,
    include: {
      fromUser: { select: { id: true, name: true } },
      toUser: { select: { id: true, name: true } },
      jar: { select: { id: true, name: true } },
    },
    orderBy: { date: 'desc' },
  });

  res.json(transfers);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const transfer = await prisma.jarTransfer.findUnique({ where: { id: Number(req.params.id) } });
  if (!transfer) return res.status(404).json({ error: 'Not found' });
  if (transfer.fromUserId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await prisma.jarTransfer.delete({ where: { id: transfer.id } });
  res.json({ ok: true });
});

export default router;
