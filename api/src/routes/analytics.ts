import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, async (req, res) => {
  const { dateFrom, dateTo } = req.query;

  // Default: last 6 months
  const to = dateTo ? new Date(dateTo as string) : new Date();
  const from = dateFrom
    ? new Date(dateFrom as string)
    : new Date(to.getFullYear(), to.getMonth() - 5, 1);

  const requesterId = req.user!.id;

  // All expenses in range (shared jars: all users; personal: own only)
  const personalJar = await prisma.jar.findFirst({ where: { isPersonal: true } });
  const allExpenses = await prisma.expense.findMany({
    where: {
      date: { gte: from, lte: to },
      OR: [
        { jar: { isPersonal: false } },
        { jarId: null },
        { userId: requesterId, jarId: personalJar?.id },
      ],
    },
    include: {
      jar: { select: { id: true, name: true, isPersonal: true, isFood: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { date: 'asc' },
  });

  // ── 1. Spending by jar ────────────────────────────────────────────────────
  const jarMap: Record<number, { jarId: number; jarName: string; total: number; count: number }> = {};
  for (const e of allExpenses) {
    if (!e.jarId || !e.jar) continue;
    const key = e.jarId;
    if (!jarMap[key]) jarMap[key] = { jarId: e.jarId, jarName: e.jar.name, total: 0, count: 0 };
    jarMap[key].total += Number(e.amountPln);
    jarMap[key].count += 1;
  }
  const spendingByJar = Object.values(jarMap).sort((a, b) => b.total - a.total);

  // ── 2. Spending by month (all jars combined, per jar) ─────────────────────
  const monthlyMap: Record<string, Record<string, number>> = {};
  for (const e of allExpenses) {
    if (!e.jar || e.jar.isPersonal) continue;
    const month = e.date.toISOString().slice(0, 7);
    if (!monthlyMap[month]) monthlyMap[month] = {};
    const jarName = e.jar.name;
    monthlyMap[month][jarName] = (monthlyMap[month][jarName] ?? 0) + Number(e.amountPln);
    monthlyMap[month]['__total'] = (monthlyMap[month]['__total'] ?? 0) + Number(e.amountPln);
  }
  const spendingByMonth = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, jars]) => ({ month, ...jars }));

  // Collect all jar names for chart legend
  const allJarNames = [...new Set(allExpenses
    .filter(e => e.jar && !e.jar.isPersonal)
    .map(e => e.jar!.name))];

  // ── 3. Spending by person ─────────────────────────────────────────────────
  const personMap: Record<number, { userId: number; name: string; total: number; count: number }> = {};
  for (const e of allExpenses) {
    if (!personMap[e.userId]) personMap[e.userId] = { userId: e.userId, name: e.user.name, total: 0, count: 0 };
    personMap[e.userId].total += Number(e.amountPln);
    personMap[e.userId].count += 1;
  }
  const spendingByPerson = Object.values(personMap);

  // ── 4. Spending by currency ───────────────────────────────────────────────
  const currencyMap: Record<string, { currency: string; totalOriginal: number; totalPln: number; count: number }> = {};
  for (const e of allExpenses) {
    const c = e.originalCurrency;
    if (!currencyMap[c]) currencyMap[c] = { currency: c, totalOriginal: 0, totalPln: 0, count: 0 };
    currencyMap[c].totalOriginal += Number(e.originalAmount);
    currencyMap[c].totalPln += Number(e.amountPln);
    currencyMap[c].count += 1;
  }
  const spendingByCurrency = Object.values(currencyMap).sort((a, b) => b.totalPln - a.totalPln);

  // ── 5. Monthly summary (income, spent, saved) ─────────────────────────────
  const users = await prisma.user.findMany();
  const monthlySummary: Array<{
    month: string; income: number; spent: number; saved: number;
  }> = [];

  // Collect months in range
  const months: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
    cur.setMonth(cur.getMonth() + 1);
  }

  for (const month of months) {
    let totalIncome = 0;
    for (const u of users) {
      const inc = await prisma.income.findUnique({ where: { userId_month: { userId: u.id, month } } });
      totalIncome += Number(inc?.netto ?? inc?.brutto ?? 0);
    }
    const overheads = await prisma.overhead.findMany({ where: { active: true } });
    const totalOverheads = overheads.reduce((s, o) => s + Number(o.amountPln), 0);

    const monthStart = new Date(`${month}-01T00:00:00.000Z`);
    const monthEnd = new Date(new Date(monthStart).setMonth(monthStart.getMonth() + 1));
    const monthExpenses = allExpenses.filter(e => e.date >= monthStart && e.date < monthEnd);
    const spent = monthExpenses.reduce((s, e) => s + Number(e.amountPln), 0);
    const discretionary = totalIncome - totalOverheads;
    const saved = discretionary - spent;

    monthlySummary.push({ month, income: totalIncome, spent, saved });
  }

  // ── 6. Carry-forward history ──────────────────────────────────────────────
  const carries = await prisma.jarCarryForward.findMany({
    where: { month: { gte: months[0], lte: months[months.length - 1] } },
    include: { jar: { select: { name: true } } },
    orderBy: { month: 'asc' },
  });

  const carryMap: Record<string, { name: string; amount: number }[]> = {};
  for (const c of carries) {
    if (!carryMap[c.month]) carryMap[c.month] = [];
    if (Number(c.amount) !== 0) {
      carryMap[c.month].push({ name: c.jar.name, amount: Number(c.amount) });
    }
  }
  const carryForwardHistory = Object.entries(carryMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, jars]) => ({ month, jars }));

  res.json({
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
    spendingByJar,
    spendingByMonth,
    allJarNames,
    spendingByPerson,
    spendingByCurrency,
    monthlySummary,
    carryForwardHistory,
  });
});

export default router;
