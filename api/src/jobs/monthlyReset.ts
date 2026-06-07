import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendMessage } from '../services/telegramNotifier';

const prisma = new PrismaClient();

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function runMonthlyReset(): Promise<void> {
  const closingMonth = prevMonth(currentMonth());
  const newMonth = currentMonth();

  console.log(`[Monthly Reset] Running for closing month: ${closingMonth}`);

  // 1. Snapshot current state before any changes
  const [users, jars, overheads, expenses, incomes, deductions, carryForwards] = await Promise.all([
    prisma.user.findMany(),
    prisma.jar.findMany(),
    prisma.overhead.findMany({ where: { active: true } }),
    prisma.expense.findMany({
      where: {
        date: {
          gte: new Date(`${closingMonth}-01T00:00:00.000Z`),
          lt: new Date(`${newMonth}-01T00:00:00.000Z`),
        },
      },
      include: { jar: true, user: true },
    }),
    prisma.income.findMany({ where: { month: closingMonth } }),
    prisma.personalDeduction.findMany({ where: { active: true } }),
    prisma.jarCarryForward.findMany({ where: { month: closingMonth } }),
  ]);

  const snapshotData = { users, jars, overheads, expenses, incomes, deductions, carryForwards };

  // 2. Calculate carry-forwards per jar
  const activeJars = jars.filter((j) => j.status === 'ACTIVE' && !j.isPersonal);
  const totalOverheads = overheads.reduce((s, o) => s + Number(o.amountPln), 0);
  const overheadShare = totalOverheads / 2;

  async function getIncome(userId: number): Promise<number> {
    const curr = incomes.find((i) => i.userId === userId);
    if (curr?.netto != null) return Number(curr.netto);
    const prev = await prisma.income.findUnique({
      where: { userId_month: { userId, month: prevMonth(closingMonth) } },
    });
    if (prev?.netto != null) return Number(prev.netto);
    return Number(curr?.brutto ?? 0);
  }

  const newCarryForwards: { jarId: number; amount: number; name: string }[] = [];
  let foodOverspend = 0;

  for (const jar of activeJars) {
    const jarExpenses = expenses.filter((e) => e.jarId === jar.id);
    const totalSpent = jarExpenses.reduce((s, e) => s + Number(e.amountPln), 0);

    let totalContribution = 0;
    for (const user of users) {
      const income = await getIncome(user.id);
      const userDeductions = deductions
        .filter((d) => d.userId === user.id)
        .reduce((s, d) => s + Number(d.amountPln), 0);
      const discretionary = income - overheadShare - userDeductions;

      if (jar.isFood) {
        totalContribution += 1000; // fixed 1000 per person
      } else {
        totalContribution += (discretionary * Number(jar.percent)) / 100;
      }
    }

    const prevCarry = carryForwards.find((c) => c.jarId === jar.id);
    const carryIn = prevCarry ? Number(prevCarry.amount) : 0;
    const carryOut = totalContribution - totalSpent + carryIn;

    newCarryForwards.push({ jarId: jar.id, amount: carryOut, name: jar.name });

    // Food overspend check
    if (jar.isFood && totalSpent > 2000) {
      foodOverspend = totalSpent - 2000;
    }
  }

  // Save snapshot
  await prisma.monthlySnapshot.upsert({
    where: { month: closingMonth },
    update: {
      snapshotData: snapshotData,
      carryForwards: newCarryForwards,
      foodOverspend,
    },
    create: {
      month: closingMonth,
      snapshotData: snapshotData,
      carryForwards: newCarryForwards,
      foodOverspend,
    },
  });

  // 3. Save carry-forwards for new month
  for (const { jarId, amount } of newCarryForwards) {
    await prisma.jarCarryForward.upsert({
      where: { jarId_month: { jarId, month: newMonth } },
      update: { amount },
      create: { jarId, month: newMonth, amount },
    });
  }

  // 4. Roll food overspend into next month's food overhead
  if (foodOverspend > 0) {
    const foodOverhead = await prisma.overhead.findFirst({ where: { name: 'Food' } });
    if (foodOverhead) {
      await prisma.overhead.update({
        where: { id: foodOverhead.id },
        data: { amountPln: Number(foodOverhead.amountPln) + foodOverspend },
      });
    }
  }

  // 5. Carry archived jars' balance to Personal jar (handled at reset)
  const archivedJars = jars.filter((j) => j.status === 'ARCHIVED');
  for (const archivedJar of archivedJars) {
    const carry = newCarryForwards.find((c) => c.jarId === archivedJar.id);
    if (carry && carry.amount !== 0) {
      // Zero out the archived jar's carry-forward — balance moved to personal
      await prisma.jarCarryForward.upsert({
        where: { jarId_month: { jarId: archivedJar.id, month: newMonth } },
        update: { amount: 0 },
        create: { jarId: archivedJar.id, month: newMonth, amount: 0 },
      });
    }
  }

  // 6. Deactivate one-off overheads and deductions
  await prisma.overhead.updateMany({ where: { isOneOff: true, active: true }, data: { active: false } });
  await prisma.personalDeduction.updateMany({ where: { isOneOff: true, active: true }, data: { active: false } });

  // 7. Notify users via Telegram
  const nonZeroCarries = newCarryForwards.filter((c) => c.amount !== 0);
  if (nonZeroCarries.length > 0) {
    const carryText = nonZeroCarries
      .map((c) => {
        const sign = c.amount > 0 ? '+' : '';
        return `${c.name} ${sign}${formatPln(c.amount)} carried forward`;
      })
      .join(' · ');
    const message = `New month, fresh start. ${carryText}.`;

    for (const user of users) {
      if (user.telegramId) {
        await sendMessage(user.telegramId, message);
      }
    }
  }

  console.log(`[Monthly Reset] Complete for ${closingMonth}`);
}

function formatPln(amount: number): string {
  return `${Math.abs(amount).toFixed(2)} PLN`;
}

export function scheduleMonthlyReset() {
  // 1st of every month at 00:01
  cron.schedule('1 0 1 * *', async () => {
    try {
      await runMonthlyReset();
    } catch (e) {
      console.error('[Monthly Reset] Error:', e);
    }
  });
  console.log('[Monthly Reset] Scheduled for 1st of month at 00:01');
}
