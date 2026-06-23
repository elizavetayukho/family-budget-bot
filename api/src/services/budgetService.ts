import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface JarBalance {
  id: number;
  name: string;
  percent: number;
  isPersonal: boolean;
  isFood: boolean;
  status: string;
  contributionLiz: number;
  contributionEdgar: number;
  totalContribution: number;
  totalSpending: number;
  carryForward: number;
  balance: number;
  // Per-requesting-user fields
  myContribution: number;
  mySpendingShare: number;
  myBalance: number;
  openingBalance: number;
}

export interface PersonResult {
  userId: number;
  name: string;
  income: number;
  incomeSource: 'netto' | 'estimated' | 'brutto';
  overheadShare: number;
  personalDeductions: number;
  discretionary: number;
  jarContributions: Record<number, number>;
  personalJarBalance: number;
}

export interface DashboardState {
  month: string;
  lizaveta: PersonResult;
  edgar: PersonResult;
  sharedJars: JarBalance[];
  uncategorisedCount: number;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function resolveIncome(
  userId: number,
  month: string
): Promise<{ amount: number; source: 'netto' | 'estimated' | 'brutto' }> {
  const current = await prisma.income.findUnique({ where: { userId_month: { userId, month } } });
  if (current?.netto != null) {
    return { amount: Number(current.netto), source: 'netto' };
  }

  const prev = await prisma.income.findUnique({
    where: { userId_month: { userId, month: prevMonth(month) } },
  });
  if (prev?.netto != null) {
    return { amount: Number(prev.netto), source: 'estimated' };
  }

  // Fall back to brutto — current month first, then any brutto
  const brutto = current?.brutto ?? prev?.brutto;
  if (brutto != null) {
    return { amount: Number(brutto), source: 'brutto' };
  }

  return { amount: 0, source: 'brutto' };
}

export async function calculateDashboard(requestingUserId: number): Promise<DashboardState> {
  const month = currentMonth();

  const [users, overheads, jars, carryForwards] = await Promise.all([
    prisma.user.findMany({ orderBy: { id: 'asc' } }),
    prisma.overhead.findMany({ where: { active: true } }),
    prisma.jar.findMany({ where: { status: 'ACTIVE' } }),
    prisma.jarCarryForward.findMany({ where: { month } }),
  ]);

  const lizUser = users.find((u) => u.role === 'ADMIN')!;
  const edgarUser = users.find((u) => u.role === 'USER')!;

  const totalOverheads = overheads.reduce((s, o) => s + Number(o.amountPln), 0);
  const overheadShare = totalOverheads / 2;

  async function calcPerson(user: typeof users[0]): Promise<PersonResult> {
    const { amount: income, source: incomeSource } = await resolveIncome(user.id, month);

    const deductions = await prisma.personalDeduction.findMany({
      where: { userId: user.id, active: true },
    });
    const personalDeductions = deductions.reduce((s, d) => s + Number(d.amountPln), 0);

    const discretionary = income - overheadShare - personalDeductions;

    const sharedJars = jars.filter((j) => !j.isPersonal && !j.isFood);
    const jarContributions: Record<number, number> = {};
    let totalContributions = 0;

    for (const jar of sharedJars) {
      const contrib = (discretionary * Number(jar.percent)) / 100;
      jarContributions[jar.id] = contrib;
      totalContributions += contrib;
    }

    const foodJar = jars.find((j) => j.isFood);
    if (foodJar) {
      jarContributions[foodJar.id] = 1000; // each person pays 1000
    }

    const personalJarBalance = discretionary - totalContributions;

    return {
      userId: user.id,
      name: user.name,
      income,
      incomeSource,
      overheadShare,
      personalDeductions,
      discretionary,
      jarContributions,
      personalJarBalance,
    };
  }

  const [liz, edgar] = await Promise.all([calcPerson(lizUser), calcPerson(edgarUser)]);

  // Build shared jar balances
  const startOfMonth = new Date(`${month}-01T00:00:00.000Z`);
  const endOfMonth = new Date(
    new Date(startOfMonth).setMonth(startOfMonth.getMonth() + 1)
  );

  const sharedJarBalances: JarBalance[] = [];

  for (const jar of jars.filter((j) => !j.isPersonal)) {
    const [expenses, transfers, topUps] = await Promise.all([
      prisma.expense.findMany({
        where: { jarId: jar.id, date: { gte: startOfMonth, lt: endOfMonth } },
      }),
      prisma.jarTransfer.findMany({
        where: { jarId: jar.id, date: { gte: startOfMonth, lt: endOfMonth } },
      }),
      prisma.jarTopUp.findMany({
        where: { jarId: jar.id, date: { gte: startOfMonth, lt: endOfMonth } },
      }),
    ]);

    const totalSpending = expenses.reduce((s, e) => s + Number(e.amountPln), 0);
    const totalTopUps = topUps.reduce((s, t) => s + Number(t.amountPln), 0);

    const carry = carryForwards.find((c) => c.jarId === jar.id);
    const carryForward = carry ? Number(carry.amount) : 0;

    const contribLiz = liz.jarContributions[jar.id] ?? 0;
    const contribEdgar = edgar.jarContributions[jar.id] ?? 0;
    const totalContribution = contribLiz + contribEdgar;

    const j = jar as { openingBalanceLiz?: unknown; openingBalanceEdgar?: unknown };
    const openingBalanceLiz = Number(j.openingBalanceLiz ?? 0);
    const openingBalanceEdgar = Number(j.openingBalanceEdgar ?? 0);
    const totalOpeningBalance = openingBalanceLiz + openingBalanceEdgar;
    const balance = totalContribution - totalSpending + carryForward + totalOpeningBalance + totalTopUps;

    // Transfers within this jar this month
    const transfersOut = transfers
      .filter(t => t.fromUserId === requestingUserId)
      .reduce((s, t) => s + Number(t.amountPln), 0);
    const transfersIn = transfers
      .filter(t => t.toUserId === requestingUserId)
      .reduce((s, t) => s + Number(t.amountPln), 0);

    // Top-ups for requesting user
    const myTopUps = topUps
      .filter(t => t.userId === requestingUserId)
      .reduce((s, t) => s + Number(t.amountPln), 0);

    // Per-requesting-user share — use actual spending by this user, not proportional
    const myContribution = requestingUserId === lizUser.id ? contribLiz : contribEdgar;
    const myOpeningBalance = requestingUserId === lizUser.id ? openingBalanceLiz : openingBalanceEdgar;
    const mySpendingShare = expenses
      .filter(e => e.userId === requestingUserId)
      .reduce((s, e) => s + Number(e.amountPln), 0);
    const myBalance = myContribution - mySpendingShare + myOpeningBalance + transfersIn - transfersOut + myTopUps;

    sharedJarBalances.push({
      id: jar.id,
      name: jar.name,
      percent: Number(jar.percent),
      isPersonal: jar.isPersonal,
      isFood: jar.isFood,
      status: jar.status,
      contributionLiz: contribLiz,
      contributionEdgar: contribEdgar,
      totalContribution,
      totalSpending,
      carryForward,
      balance,
      myContribution,
      mySpendingShare,
      myBalance,
      openingBalance: myOpeningBalance,
    });
  }

  // Personal jar spending for requesting user only
  const personalJar = jars.find((j) => j.isPersonal);
  let personalJarBalance = requestingUserId === lizUser.id
    ? liz.personalJarBalance
    : edgar.personalJarBalance;

  if (personalJar) {
    const personalExpenses = await prisma.expense.findMany({
      where: {
        jarId: personalJar.id,
        userId: requestingUserId,
        date: { gte: startOfMonth, lt: endOfMonth },
      },
    });
    const personalSpending = personalExpenses.reduce((s, e) => s + Number(e.amountPln), 0);
    personalJarBalance -= personalSpending;
  }

  const uncategorisedCount = await prisma.expense.count({
    where: {
      userId: requestingUserId,
      jarId: null,
      date: { gte: startOfMonth, lt: endOfMonth },
    },
  });

  const requester = requestingUserId === lizUser.id ? liz : edgar;
  const other = requestingUserId === lizUser.id ? edgar : liz;

  // Sanitise: personal jar balance for requester only
  return {
    month,
    lizaveta: requestingUserId === lizUser.id ? { ...liz } : {
      ...other,
      personalJarBalance: 0, // never expose other person's personal balance
      jarContributions: other.jarContributions,
    },
    edgar: requestingUserId === edgarUser.id ? { ...edgar } : {
      ...edgar,
      personalJarBalance: 0,
    },
    sharedJars: sharedJarBalances,
    uncategorisedCount,
  };
}
