import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, async (_req, res) => {
  const jars = await prisma.jar.findMany({ where: { status: 'ACTIVE' } });
  res.json(jars);
});

router.get('/archived', requireAuth, async (_req, res) => {
  const jars = await prisma.jar.findMany({ where: { status: 'ARCHIVED' }, orderBy: { archivedAt: 'desc' } });
  res.json(jars);
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, percent = 0 } = req.body;
  const jar = await prisma.jar.create({ data: { name, percent } });
  res.status(201).json(jar);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, percent } = req.body;
  const jar = await prisma.jar.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(percent !== undefined ? { percent } : {}),
    },
  });
  res.json(jar);
});

router.post('/:id/archive', requireAuth, requireAdmin, async (req, res) => {
  const jar = await prisma.jar.update({
    where: { id: Number(req.params.id) },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
  res.json(jar);
});

router.post('/:id/restore', requireAuth, requireAdmin, async (req, res) => {
  const jar = await prisma.jar.update({
    where: { id: Number(req.params.id) },
    data: { status: 'ACTIVE', archivedAt: null },
  });
  res.json(jar);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const expenseCount = await prisma.expense.count({ where: { jarId: id } });
  if (expenseCount > 0) {
    return res.status(400).json({ error: 'Cannot delete jar with transaction history' });
  }
  await prisma.jar.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
