import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendMessage } from '../services/telegramNotifier';

const prisma = new PrismaClient();

export async function runUncategorisedReminder(): Promise<void> {
  const thresholdDays = Number(process.env.UNCATEGORISED_REMINDER_DAYS ?? 3);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - thresholdDays);

  const users = await prisma.user.findMany({ where: { telegramId: { not: null } } });

  for (const user of users) {
    // Find uncategorised expenses older than threshold
    const oldUncategorised = await prisma.expense.findMany({
      where: {
        userId: user.id,
        jarId: null,
        createdAt: { lte: cutoff },
      },
    });

    if (oldUncategorised.length === 0) continue;

    // Check if we already sent a reminder for this batch
    // A "batch" = the set of expense IDs at the time — we use the oldest createdAt as the marker
    const oldestExpense = oldUncategorised.reduce((a, b) =>
      a.createdAt < b.createdAt ? a : b
    );

    const lastReminder = await prisma.uncategorisedReminder.findFirst({
      where: { userId: user.id },
      orderBy: { sentAt: 'desc' },
    });

    // Don't re-send if we sent a reminder after the oldest uncategorised expense was created
    if (lastReminder && lastReminder.sentAt > oldestExpense.createdAt) continue;

    // Send reminder
    const count = oldUncategorised.length;
    const webUrl = process.env.WEB_APP_URL ?? 'http://localhost:5173';
    const message =
      `You have ${count} expense${count > 1 ? 's' : ''} without a jar. ` +
      `Assign them on the web app at ${webUrl}`;

    await sendMessage(user.telegramId!, message);

    await prisma.uncategorisedReminder.create({
      data: { userId: user.id, expenseCount: count },
    });

    console.log(`[Uncategorised Reminder] Sent to user ${user.id} for ${count} expenses`);
  }
}

export function scheduleUncategorisedReminder() {
  // Daily at 09:00
  cron.schedule('0 9 * * *', async () => {
    try {
      await runUncategorisedReminder();
    } catch (e) {
      console.error('[Uncategorised Reminder] Error:', e);
    }
  });
  console.log('[Uncategorised Reminder] Scheduled for daily at 09:00');
}
