import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, async (_req, res) => {
  const overheads = await prisma.overhead.findMany({ where: { active: true } });
  res.json(overheads);
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, amountPln, isOneOff = false } = req.body;
  const overhead = await prisma.overhead.create({ data: { name, amountPln, isOneOff } });
  res.status(201).json(overhead);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, amountPln, isOneOff } = req.body;
  const overhead = await prisma.overhead.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(amountPln !== undefined ? { amountPln } : {}),
      ...(isOneOff !== undefined ? { isOneOff } : {}),
    },
  });
  res.json(overhead);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  await prisma.overhead.update({ where: { id: Number(req.params.id) }, data: { active: false } });
  res.json({ ok: true });
});

export default router;
