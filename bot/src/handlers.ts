import { BotContext } from './session';
import prisma from './db';
import fetch from 'node-fetch';

const WEB_URL = process.env.WEB_APP_URL ?? 'http://localhost:5173';
const API_URL = 'http://localhost:3001';

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function resolveUser(telegramId: string) {
  return prisma.user.findUnique({ where: { telegramId } });
}

function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

async function getActiveJars() {
  return prisma.jar.findMany({ where: { status: 'ACTIVE', isPersonal: false } });
}

async function getNBPRate(currency: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.nbp.pl/api/exchangerates/rates/a/${currency.toLowerCase()}/`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json() as { rates: Array<{ mid: number }> };
    return data.rates[0].mid;
  } catch {
    return null;
  }
}

function parseExpenseText(text: string): { amount: number; currency: string; jarHint?: string } | null {
  // e.g. "spent 45 on eating out", "45 PLN food", "50 USD on vacation"
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(PLN|USD|EUR|BYN)?\s*(?:on\s+)?(.+)?/i);
  if (!match) return null;
  const amount = parseFloat(match[1].replace(',', '.'));
  if (isNaN(amount) || amount <= 0) return null;
  const currency = (match[2] ?? 'PLN').toUpperCase();
  const jarHint = match[3]?.trim().toLowerCase();
  return { amount, currency, jarHint };
}

function matchJar(hint: string, jars: Awaited<ReturnType<typeof getActiveJars>>) {
  if (!hint) return undefined;
  return jars.find((j) =>
    j.name.toLowerCase().includes(hint) || hint.includes(j.name.toLowerCase().split(' ')[0])
  );
}

// ── Account linking ───────────────────────────────────────────────────────────

export async function handleLinkCode(ctx: BotContext) {
  const text = ctx.message?.text ?? '';
  const code = text.trim();
  if (!/^\d{6}$/.test(code)) return false;

  const user = await prisma.user.findFirst({ where: { telegramLinkCode: code } });
  if (!user) return false;

  await prisma.user.update({
    where: { id: user.id },
    data: { telegramId: String(ctx.from!.id), telegramLinkCode: null },
  });

  await ctx.reply(`✓ Linked! Welcome, ${user.name}. You can now log expenses and check balances.`);
  return true;
}

// ── Balance check ─────────────────────────────────────────────────────────────

export async function handleBalance(ctx: BotContext, jarHint?: string) {
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (!user) {
    return ctx.reply(`Link your Telegram account first at ${WEB_URL}/account`);
  }

  const isPrivate = ctx.chat?.type === 'private';
  const jars = await getActiveJars();

  const month = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const startOfMonth = new Date(`${month}-01T00:00:00.000Z`);
  const endOfMonth = new Date(new Date(startOfMonth).setMonth(startOfMonth.getMonth() + 1));
  const daysInMonth = (endOfMonth.getTime() - startOfMonth.getTime()) / 86400000;
  const today = new Date().getDate();

  // Filter to a specific jar if hint given
  const targetJars = jarHint
    ? jars.filter((j) =>
        j.name.toLowerCase().includes(jarHint.toLowerCase()) ||
        jarHint.toLowerCase().includes(j.name.toLowerCase().split(' ')[0])
      )
    : jars;

  if (targetJars.length === 0) {
    return ctx.reply(`Couldn't find that jar.`);
  }

  const lines: string[] = [];

  for (const jar of targetJars) {
    if (jar.isPersonal && !isPrivate) continue;

    const expenses = await prisma.expense.findMany({
      where: { jarId: jar.id, date: { gte: startOfMonth, lt: endOfMonth } },
    });
    const totalSpent = expenses.reduce((s, e) => s + Number(e.amountPln), 0);

    // Calculate total contribution
    const users = await prisma.user.findMany();
    const overheads = await prisma.overhead.findMany({ where: { active: true } });
    const totalOverheads = overheads.reduce((s, o) => s + Number(o.amountPln), 0);
    const overheadShare = totalOverheads / 2;

    let totalContribution = 0;
    for (const u of users) {
      const income = await prisma.income.findUnique({ where: { userId_month: { userId: u.id, month } } });
      const deductions = await prisma.personalDeduction.findMany({ where: { userId: u.id, active: true } });
      const deductTotal = deductions.reduce((s, d) => s + Number(d.amountPln), 0);
      const inc = Number(income?.netto ?? income?.brutto ?? 0);
      const disc = inc - overheadShare - deductTotal;
      totalContribution += jar.isFood ? 1000 : (disc * Number(jar.percent)) / 100;
    }

    const carry = await prisma.jarCarryForward.findUnique({ where: { jarId_month: { jarId: jar.id, month } } });
    const balance = totalContribution - totalSpent + Number(carry?.amount ?? 0);

    lines.push(`${jar.name}: ${fmt(balance)} PLN left of ${fmt(totalContribution)} PLN · Day ${today}/${Math.round(daysInMonth)}`);
  }

  if (isPrivate) {
    // Add personal jar
    const personalJar = await prisma.jar.findFirst({ where: { isPersonal: true } });
    if (personalJar) {
      const personalExpenses = await prisma.expense.findMany({
        where: { jarId: personalJar.id, userId: user.id, date: { gte: startOfMonth, lt: endOfMonth } },
      });
      const personalSpent = personalExpenses.reduce((s, e) => s + Number(e.amountPln), 0);

      const income = await prisma.income.findUnique({ where: { userId_month: { userId: user.id, month } } });
      const deductions = await prisma.personalDeduction.findMany({ where: { userId: user.id, active: true } });
      const deductTotal = deductions.reduce((s, d) => s + Number(d.amountPln), 0);
      const overheads = await prisma.overhead.findMany({ where: { active: true } });
      const totalOverheads = overheads.reduce((s, o) => s + Number(o.amountPln), 0);
      const inc = Number(income?.netto ?? income?.brutto ?? 0);
      const disc = inc - totalOverheads / 2 - deductTotal;

      const sharedJars = await prisma.jar.findMany({ where: { status: 'ACTIVE', isPersonal: false, isFood: false } });
      const contributions = sharedJars.reduce((s, j) => s + (disc * Number(j.percent)) / 100, 0);
      const personalBalance = disc - contributions - personalSpent;

      lines.push(`Personal: ${fmt(personalBalance)} PLN`);
    }
  }

  await ctx.reply(lines.join('\n') || 'No jars found.');
}

// ── Expense logging ───────────────────────────────────────────────────────────

export async function handleExpenseText(ctx: BotContext) {
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (!user) {
    return ctx.reply(`Link your Telegram account first at ${WEB_URL}/account`);
  }

  const text = ctx.message?.text ?? '';
  const parsed = parseExpenseText(text);
  if (!parsed) return; // not an expense message

  const { amount, currency, jarHint } = parsed;
  const jars = await getActiveJars();

  // Check if we need a rate
  if (currency !== 'PLN') {
    let rate: number | null = null;
    if (currency === 'BYN') {
      // Always manual
      ctx.session.expense = { step: 'awaiting_rate', amount, currency, jarHint: jarHint };
      return ctx.reply(
        `No BYN rate available. Enter the rate (1 BYN = ? PLN):`,
        { reply_markup: { inline_keyboard: [[{ text: 'Cancel', callback_data: 'cancel' }]] } }
      );
    }

    rate = await getNBPRate(currency);
    if (rate === null) {
      ctx.session.expense = { step: 'awaiting_rate', amount, currency, jarHint: jarHint };
      return ctx.reply(
        `Couldn't fetch ${currency} rate. Enter the rate (1 ${currency} = ? PLN):`,
        { reply_markup: { inline_keyboard: [[{ text: 'Cancel', callback_data: 'cancel' }]] } }
      );
    }

    ctx.session.expense = { ...ctx.session.expense, rate };
  }

  // Try to match jar
  const matchedJar = jarHint ? matchJar(jarHint, jars) : undefined;

  if (jarHint && !matchedJar) {
    // Ambiguous — ask user to pick
    const rate = ctx.session.expense?.rate;
    ctx.session.expense = { step: 'pick_jar', amount, currency, rate };
    const keyboard = [
      ...jars.map((j) => [{ text: j.name, callback_data: `jar:${j.id}:${j.name}` }]),
      [{ text: 'No jar', callback_data: 'jar:null:No jar' }],
      [{ text: 'Cancel', callback_data: 'cancel' }],
    ];
    const amountPln = rate ? amount * rate : amount;
    return ctx.reply(
      `${fmt(amountPln)} PLN — which jar?`,
      { reply_markup: { inline_keyboard: keyboard } }
    );
  }

  // Ready for confirmation
  const rate = ctx.session.expense?.rate ?? 1;
  const amountPln = currency === 'PLN' ? amount : amount * rate;
  ctx.session.expense = {
    step: 'confirm',
    amount,
    currency,
    rate: currency === 'PLN' ? undefined : rate,
    jarId: matchedJar?.id ?? null,
    jarName: matchedJar?.name ?? 'No jar',
  };

  const label = currency !== 'PLN'
    ? `${fmt(amount)} ${currency} (${fmt(amountPln)} PLN)`
    : `${fmt(amount)} PLN`;

  await ctx.reply(
    `${label} · ${matchedJar?.name ?? 'No jar'} — save it?`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Save', callback_data: 'save' },
          { text: 'Edit', callback_data: 'edit' },
          { text: 'Cancel', callback_data: 'cancel' },
        ]],
      },
    }
  );
}

export async function handleCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  if (data === 'cancel') {
    ctx.session.expense = undefined;
    return ctx.editMessageText('OK, nothing saved.');
  }

  if (data === 'save') {
    return saveExpense(ctx);
  }

  if (data === 'edit') {
    ctx.session.expense = undefined;
    return ctx.editMessageText('Edit cancelled — enter your expense again.');
  }

  if (data.startsWith('jar:')) {
    const [, jarIdStr, jarName] = data.split(':');
    const jarId = jarIdStr === 'null' ? null : Number(jarIdStr);
    const session = ctx.session.expense ?? {};
    const rate = session.rate ?? 1;
    const amount = session.amount ?? 0;
    const currency = session.currency ?? 'PLN';
    const amountPln = currency === 'PLN' ? amount : amount * rate;

    ctx.session.expense = { ...session, step: 'confirm', jarId, jarName };

    const label = currency !== 'PLN'
      ? `${fmt(amount)} ${currency} (${fmt(amountPln)} PLN)`
      : `${fmt(amount)} PLN`;

    return ctx.editMessageText(
      `${label} · ${jarName} — save it?`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Save', callback_data: 'save' },
            { text: 'Cancel', callback_data: 'cancel' },
          ]],
        },
      }
    );
  }
}

export async function handleRateInput(ctx: BotContext) {
  const session = ctx.session.expense;
  if (session?.step !== 'awaiting_rate') return false;

  const text = ctx.message?.text ?? '';
  const rate = parseFloat(text.replace(',', '.'));
  if (isNaN(rate) || rate <= 0) {
    await ctx.reply('Please enter a valid number for the rate.');
    return true;
  }

  const { amount = 0, currency = 'PLN', jarHint } = session;
  const amountPln = amount * rate;
  const jars = await getActiveJars();
  const matchedJar = jarHint ? matchJar(jarHint, jars) : undefined;

  ctx.session.expense = {
    step: 'confirm',
    amount,
    currency,
    rate,
    jarId: matchedJar?.id ?? null,
    jarName: matchedJar?.name ?? 'No jar',
  };

  const label = `${fmt(amount)} ${currency} (${fmt(amountPln)} PLN)`;
  await ctx.reply(
    `${label} · ${matchedJar?.name ?? 'No jar'} — save it?`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Save', callback_data: 'save' },
          { text: 'Cancel', callback_data: 'cancel' },
        ]],
      },
    }
  );
  return true;
}

async function saveExpense(ctx: BotContext) {
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (!user) return ctx.editMessageText('Error: user not found.');

  const session = ctx.session.expense;
  if (!session) return ctx.editMessageText('Nothing to save.');

  const { amount = 0, currency = 'PLN', jarId, rate } = session;
  const amountPln = currency === 'PLN' ? amount : amount * (rate ?? 1);

  await prisma.expense.create({
    data: {
      userId: user.id,
      jarId: jarId ?? null,
      amountPln,
      originalAmount: amount,
      originalCurrency: currency,
      exchangeRate: currency !== 'PLN' ? rate : null,
      isManualRate: currency !== 'PLN' && !!rate,
      date: new Date(),
    },
  });

  ctx.session.expense = undefined;

  if (jarId === null || jarId === undefined) {
    return ctx.editMessageText('Saved as uncategorised. Assign a jar on the web app.');
  }
  return ctx.editMessageText('Saved ✓');
}
