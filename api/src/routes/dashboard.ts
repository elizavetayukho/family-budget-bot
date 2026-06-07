import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { calculateDashboard } from '../services/budgetService';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, async (req, res) => {
  try {
    const state = await calculateDashboard(req.user!.id);
    res.json(state);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to calculate dashboard' });
  }
});

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const month = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();

    const [users, overheads, incomes] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, role: true } }),
      prisma.overhead.findMany({ where: { active: true } }),
      prisma.income.findMany({ where: { month } }),
    ]);

    const deductions = await prisma.personalDeduction.findMany({
      where: { userId: req.user!.id, active: true },
    });

    res.json({ users, overheads, incomes, deductions, month });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

export default router;
