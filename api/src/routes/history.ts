import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, async (req, res) => {
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

// Derive per-person jar summary from raw snapshotData
function computePersonSummary(data: any) {
  const { users, jars, overheads, expenses, incomes, deductions } = data;
  if (!users || !jars || !expenses || !incomes) return [];

  const totalOverheads = (overheads || []).reduce((s: number, o: any) => s + Number(o.amountPln), 0);
  const overheadShare = totalOverheads / 2;
  const activeJars = jars.filter((j: any) => j.status === 'ACTIVE' && !j.isPersonal);

  return users.map((user: any) => {
    const income = incomes.find((i: any) => i.userId === user.id);
    const netto = income?.netto != null ? Number(income.netto) : Number(income?.brutto ?? 0);
    const userDeductions = (deductions || [])
      .filter((d: any) => d.userId === user.id && d.active !== false)
      .reduce((s: number, d: any) => s + Number(d.amountPln), 0);
    const discretionary = netto - overheadShare - userDeductions;

    const jarSummaries = activeJars.map((jar: any) => {
      let contribution: number;
      if (jar.fixedAmountPln != null) {
        contribution = Number(jar.fixedAmountPln);
      } else if (jar.isFood) {
        contribution = 1000;
      } else {
        contribution = (discretionary * Number(jar.percent)) / 100;
      }
      const spending = expenses
        .filter((e: any) => e.userId === user.id && e.jarId === jar.id)
        .reduce((s: number, e: any) => s + Number(e.amountPln), 0);
      return { jarId: jar.id, name: jar.name, contribution, spending, net: contribution - spending };
    });

    const totalContribution = jarSummaries.reduce((s: number, j) => s + j.contribution, 0);
    const totalSpending = jarSummaries.reduce((s: number, j) => s + j.spending, 0);

    return {
      userId: user.id,
      name: user.name,
      income: netto,
      totalContribution,
      totalSpending,
      net: totalContribution - totalSpending,
      jars: jarSummaries,
    };
  });
}

router.get('/snapshots/:month', requireAuth, async (req, res) => {
  const snapshot = await prisma.monthlySnapshot.findUnique({
    where: { month: req.params.month },
  });
  if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });

  const personSummary = computePersonSummary(snapshot.snapshotData);
  res.json({ ...snapshot, personSummary });
});

export default router;
