import { BotContext } from './session';
import prisma from './db';
import fetch from 'node-fetch';

const WEB_URL = process.env.WEB_APP_URL ?? 'http://localhost:5173';

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

// Parse: "spent 45 on eating out for pizza"
// Supports: "45", "45 PLN", "45 USD", "on <jar>", "for <desc>", "- <desc>", "#<desc>"
function parseExpenseText(text: string): {
  amount: number;
  currency: string;
  jarHint?: string;
  description?: string;
} | null {
  const t = text.trim();

  // Extract amount + optional currency
  const amountMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(PLN|USD|EUR|BYN)?/i);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1].replace(',', '.'));
  if (isNaN(amount) || amount <= 0) return null;
  const currency = (amountMatch[2] ?? 'PLN').toUpperCase();

  // Remove the amount+currency from the string to parse the rest
  let rest = t.slice(amountMatch.index! + amountMatch[0].length).trim();
  // Remove leading "spent", "on", "for", "-", "–"
  rest = rest.replace(/^(spent|on|for|-|–)\s*/i, '');

  // Try to extract description after "for", "-", "–", ":"
  let jarHint: string | undefined;
  let description: string | undefined;

  // Pattern: "<jar> for <description>" or "<jar> - <description>"
  const forMatch = rest.match(/^(.+?)\s+(?:for|-|–|:)\s+(.+)$/i);
  if (forMatch) {
    jarHint = forMatch[1].trim();
    description = forMatch[2].trim();
  } else {
    // No separator — whole rest is jar hint
    jarHint = rest || undefined;
  }

  return { amount, currency, jarHint: jarHint || undefined, description };
}

function matchJar(hint: string, jars: Awaited<ReturnType<typeof getActiveJars>>) {
  const h = hint.toLowerCase();
  // Exact match first
  const exact = jars.find((j) => j.name.toLowerCase() === h);
  if (exact) return exact;
  // Partial match
  return jars.find((j) =>
    j.name.toLowerCase().includes(h) || h.includes(j.name.toLowerCase().split(' ')[0])
  );
}

async function showConfirmation(ctx: BotContext, editMessage = false) {
  const s = ctx.session.expense!;
  const amountPln = s.currency === 'PLN' ? s.amount! : s.amount! * (s.rate ?? 1);
  const text = buildConfirmText(s.amount!, s.currency!, amountPln, s.jarName!, s.description, s.rate);
  const keyboard = { inline_keyboard: [[
    { text: 'Save ✓', callback_data: 'save' },
    { text: 'Change jar', callback_data: 'change_jar' },
    { text: 'Cancel', callback_data: 'cancel' },
  ]]};
  ctx.session.expense = { ...s, step: 'confirm' };
  if (editMessage) await ctx.editMessageText(text, { reply_markup: keyboard });
  else await ctx.reply(text, { reply_markup: keyboard });
}

async function promptDescription(ctx: BotContext, editMessage = false) {
  const keyboard = { inline_keyboard: [[{ text: 'Skip', callback_data: 'skip_description' }, { text: 'Cancel', callback_data: 'cancel' }]] };
  const text = 'Add a description? (type it or tap Skip)';
  if (editMessage) {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  } else {
    await ctx.reply(text, { reply_markup: keyboard });
  }
}

function buildConfirmText(amount: number, currency: string, amountPln: number, jarName: string, description?: string, rate?: number) {
  const amountStr = currency !== 'PLN'
    ? `${fmt(amount)} ${currency} (${fmt(amountPln)} PLN, rate: ${rate?.toFixed(4)})`
    : `${fmt(amount)} PLN`;
  const descStr = description ? ` · "${description}"` : '';
  return `${amountStr} · ${jarName}${descStr} — save it?`;
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
  const daysInMonth = Math.round((endOfMonth.getTime() - startOfMonth.getTime()) / 86400000);
  const today = new Date().getDate();

  const targetJars = jarHint
    ? jars.filter((j) => j.name.toLowerCase().includes(jarHint.toLowerCase()))
    : jars.filter((j) => !j.isPersonal);

  if (targetJars.length === 0) return ctx.reply(`Couldn't find that jar.`);

  const overheads = await prisma.overhead.findMany({ where: { active: true } });
  const totalOverheads = overheads.reduce((s, o) => s + Number(o.amountPln), 0);
  const overheadShare = totalOverheads / 2;
  const allUsers = await prisma.user.findMany();

  const lines: string[] = [];

  for (const jar of targetJars) {
    if (jar.isPersonal && !isPrivate) continue;

    const expenses = await prisma.expense.findMany({
      where: { jarId: jar.id, date: { gte: startOfMonth, lt: endOfMonth } },
    });
    const totalSpent = expenses.reduce((s, e) => s + Number(e.amountPln), 0);

    let totalContribution = 0;
    for (const u of allUsers) {
      const income = await prisma.income.findUnique({ where: { userId_month: { userId: u.id, month } } });
      const deductions = await prisma.personalDeduction.findMany({ where: { userId: u.id, active: true } });
      const deductTotal = deductions.reduce((s, d) => s + Number(d.amountPln), 0);
      const inc = Number(income?.netto ?? income?.brutto ?? 0);
      const disc = inc - overheadShare - deductTotal;
      totalContribution += jar.isFood ? 1000 : (disc * Number(jar.percent)) / 100;
    }

    const carry = await prisma.jarCarryForward.findUnique({ where: { jarId_month: { jarId: jar.id, month } } });
    const balance = totalContribution - totalSpent + Number(carry?.amount ?? 0);
    lines.push(`${jar.name}: ${fmt(balance)} PLN left · Day ${today}/${daysInMonth}`);
  }

  if (isPrivate) {
    const personalJar = await prisma.jar.findFirst({ where: { isPersonal: true } });
    if (personalJar) {
      const personalExpenses = await prisma.expense.findMany({
        where: { jarId: personalJar.id, userId: user.id, date: { gte: startOfMonth, lt: endOfMonth } },
      });
      const personalSpent = personalExpenses.reduce((s, e) => s + Number(e.amountPln), 0);
      const income = await prisma.income.findUnique({ where: { userId_month: { userId: user.id, month } } });
      const deductions = await prisma.personalDeduction.findMany({ where: { userId: user.id, active: true } });
      const deductTotal = deductions.reduce((s, d) => s + Number(d.amountPln), 0);
      const inc = Number(income?.netto ?? income?.brutto ?? 0);
      const disc = inc - overheadShare - deductTotal;
      const sharedJarsList = await prisma.jar.findMany({ where: { status: 'ACTIVE', isPersonal: false, isFood: false } });
      const contributions = sharedJarsList.reduce((s, j) => s + (disc * Number(j.percent)) / 100, 0);
      lines.push(`Personal: ${fmt(disc - contributions - personalSpent)} PLN`);
    }
  }

  await ctx.reply(lines.join('\n') || 'No jars found.');
}

// ── Expense logging ───────────────────────────────────────────────────────────

export async function handleExpenseText(ctx: BotContext) {
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (!user) return ctx.reply(`Link your Telegram account first at ${WEB_URL}/account`);

  const text = ctx.message?.text ?? '';
  const parsed = parseExpenseText(text);
  if (!parsed) return;

  const { amount, currency, jarHint, description } = parsed;
  const jars = await getActiveJars();

  // Handle non-PLN rates
  let rate: number | undefined;
  if (currency !== 'PLN') {
    if (currency === 'BYN') {
      ctx.session.expense = { step: 'awaiting_rate', amount, currency, jarHint, description };
      return ctx.reply(
        `No BYN rate available. Enter the rate (1 BYN = ? PLN):`,
        { reply_markup: { inline_keyboard: [[{ text: 'Cancel', callback_data: 'cancel' }]] } }
      );
    }
    const fetched = await getNBPRate(currency);
    if (!fetched) {
      ctx.session.expense = { step: 'awaiting_rate', amount, currency, jarHint, description };
      return ctx.reply(
        `Couldn't fetch ${currency} rate. Enter the rate (1 ${currency} = ? PLN):`,
        { reply_markup: { inline_keyboard: [[{ text: 'Cancel', callback_data: 'cancel' }]] } }
      );
    }
    rate = fetched;
  }

  const amountPln = currency === 'PLN' ? amount : amount * rate!;
  const matchedJar = jarHint ? matchJar(jarHint, jars) : undefined;

  // No jar matched or no jar given → show jar picker
  if (!matchedJar) {
    ctx.session.expense = { step: 'pick_jar', amount, currency, rate, description };
    const keyboard = [
      ...jars.map((j) => [{ text: j.name, callback_data: `jar:${j.id}:${j.name}` }]),
      [{ text: 'No jar (save uncategorised)', callback_data: 'jar:null:No jar' }],
      [{ text: 'Cancel', callback_data: 'cancel' }],
    ];
    const amountStr = currency !== 'PLN' ? `${fmt(amount)} ${currency} (${fmt(amountPln)} PLN)` : `${fmt(amount)} PLN`;
    return ctx.reply(`${amountStr} — which jar?`, { reply_markup: { inline_keyboard: keyboard } });
  }

  // Jar matched — prompt for description if not already provided
  ctx.session.expense = { step: 'awaiting_description', amount, currency, rate, jarId: matchedJar.id, jarName: matchedJar.name, description };
  if (description) {
    await showConfirmation(ctx);
  } else {
    await promptDescription(ctx);
  }
}

export async function handleCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  await ctx.answerCallbackQuery();

  if (data === 'cancel') {
    ctx.session.expense = undefined;
    return ctx.editMessageText('OK, nothing saved.');
  }

  if (data === 'save') return saveExpense(ctx);

  if (data === 'skip_description') {
    ctx.session.expense = { ...ctx.session.expense };
    await showConfirmation(ctx, true);
    return;
  }

  if (data === 'change_jar') {
    const session = ctx.session.expense ?? {};
    ctx.session.expense = { ...session, step: 'pick_jar' };
    const jars = await getActiveJars();
    const keyboard = [
      ...jars.map((j) => [{ text: j.name, callback_data: `jar:${j.id}:${j.name}` }]),
      [{ text: 'No jar (save uncategorised)', callback_data: 'jar:null:No jar' }],
      [{ text: 'Cancel', callback_data: 'cancel' }],
    ];
    return ctx.editMessageText('Which jar?', { reply_markup: { inline_keyboard: keyboard } });
  }

  if (data.startsWith('jar:')) {
    const parts = data.split(':');
    const jarId = parts[1] === 'null' ? null : Number(parts[1]);
    const jarName = parts.slice(2).join(':');
    const session = ctx.session.expense ?? {};
    ctx.session.expense = { ...session, step: 'awaiting_description', jarId, jarName };
    // Prompt for description (edit the jar-picker message)
    await promptDescription(ctx, true);
    return;
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

  const { amount = 0, currency = 'PLN', jarHint, description } = session;
  const amountPln = amount * rate;
  const jars = await getActiveJars();
  const matchedJar = jarHint ? matchJar(jarHint, jars) : undefined;

  if (!matchedJar) {
    ctx.session.expense = { step: 'pick_jar', amount, currency, rate, description };
    const keyboard = [
      ...jars.map((j) => [{ text: j.name, callback_data: `jar:${j.id}:${j.name}` }]),
      [{ text: 'No jar (save uncategorised)', callback_data: 'jar:null:No jar' }],
      [{ text: 'Cancel', callback_data: 'cancel' }],
    ];
    await ctx.reply(`${fmt(amount)} ${currency} (${fmt(amountPln)} PLN) — which jar?`, { reply_markup: { inline_keyboard: keyboard } });
    return true;
  }

  ctx.session.expense = { step: 'awaiting_description', amount, currency, rate, jarId: matchedJar.id, jarName: matchedJar.name, description };
  if (description) {
    await showConfirmation(ctx);
  } else {
    await promptDescription(ctx);
  }
  return true;
}

export async function handleDescriptionInput(ctx: BotContext) {
  await showConfirmation(ctx);
}

async function saveExpense(ctx: BotContext) {
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (!user) return ctx.editMessageText('Error: user not found.');

  const session = ctx.session.expense;
  if (!session) return ctx.editMessageText('Nothing to save.');

  const { amount = 0, currency = 'PLN', jarId, rate, description } = session;
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
      description: description ?? null,
      date: new Date(),
    },
  });

  ctx.session.expense = undefined;

  const savedMsg = jarId === null
    ? `Saved as uncategorised ✓\nDescription: ${description || '—'}\nAssign a jar on the web app.`
    : `Saved ✓`;

  return ctx.editMessageText(savedMsg);
}
