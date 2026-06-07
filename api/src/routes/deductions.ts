import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, async (req, res) => {
  const isAdmin = req.user!.role === 'ADMIN';
  const targetId = req.query.userId ? Number(req.query.userId) : null;

  if (targetId && !isAdmin && targetId !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (isAdmin && !targetId) {
    // Admin fetching all — return for all users
    const deductions = await prisma.personalDeduction.findMany({ where: { active: true } });
    return res.json(deductions);
  }

  const deductions = await prisma.personalDeduction.findMany({
    where: { userId: targetId ?? req.user!.id, active: true },
  });
  res.json(deductions);
});

router.post('/', requireAuth, async (req, res) => {
  const isAdmin = req.user!.role === 'ADMIN';
  const { name, amountPln, isOneOff = false, userId } = req.body;
  const targetId = userId && isAdmin ? Number(userId) : req.user!.id;

  const deduction = await prisma.personalDeduction.create({
    data: { userId: targetId, name, amountPln, isOneOff },
  });
  res.status(201).json(deduction);
});

router.patch('/:id', requireAuth, async (req, res) => {
  const isAdmin = req.user!.role === 'ADMIN';
  const deduction = await prisma.personalDeduction.findUnique({ where: { id: Number(req.params.id) } });
  if (!deduction) return res.status(404).json({ error: 'Not found' });
  if (!isAdmin && deduction.userId !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name, amountPln, isOneOff } = req.body;
  const updated = await prisma.personalDeduction.update({
    where: { id: deduction.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(amountPln !== undefined ? { amountPln } : {}),
      ...(isOneOff !== undefined ? { isOneOff } : {}),
    },
  });
  res.json(updated);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const isAdmin = req.user!.role === 'ADMIN';
  const deduction = await prisma.personalDeduction.findUnique({ where: { id: Number(req.params.id) } });
  if (!deduction) return res.status(404).json({ error: 'Not found' });
  if (!isAdmin && deduction.userId !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await prisma.personalDeduction.update({ where: { id: deduction.id }, data: { active: false } });
  res.json({ ok: true });
});

export default router;
