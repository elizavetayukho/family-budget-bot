import { BotContext } from './session';
import prisma from './db';
import fetch from 'node-fetch';
import { parseExpenseAmount, extractJarAndDescription, fuzzyFindJar } from './nlp';

const WEB_URL = process.env.WEB_APP_URL ?? 'http://localhost:5173';

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

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function prevMonthOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Same logic as budgetService.resolveIncome
async function resolveIncomeForUser(userId: number, month: string): Promise<number> {
  const current = await prisma.income.findUnique({ where: { userId_month: { userId, month } } });
  if (current?.netto != null) return Number(current.netto);
  const prev = await prisma.income.findUnique({ where: { userId_month: { userId, month: prevMonthOf(month) } } });
  if (prev?.netto != null) return Number(prev.netto);
  const currentBrutto = current?.brutto != null && Number(current.brutto) > 0 ? Number(current.brutto) : null;
  const prevBrutto = prev?.brutto != null && Number(prev.brutto) > 0 ? Number(prev.brutto) : null;
  return currentBrutto ?? prevBrutto ?? 0;
}

export async function handleBalance(ctx: BotContext, jarHint?: string) {
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (!user) {
    return ctx.reply(`Your Telegram isn't linked yet.\n\n1. Open the app → Account\n2. Tap "Generate code"\n3. Send the 6-digit code here`);
  }

  const isPrivate = ctx.chat?.type === 'private';
  const month = currentMonth();
  const startOfMonth = new Date(`${month}-01T00:00:00.000Z`);
  const endOfMonth = new Date(new Date(startOfMonth).setMonth(startOfMonth.getMonth() + 1));
  const daysInMonth = Math.round((endOfMonth.getTime() - startOfMonth.getTime()) / 86400000);
  const today = new Date().getDate();

  const [allJars, overheads, allUsers, personCarryForwards] = await Promise.all([
    prisma.jar.findMany({ where: { status: 'ACTIVE' } }),
    prisma.overhead.findMany({ where: { active: true } }),
    prisma.user.findMany(),
    prisma.jarPersonCarryForward.findMany({ where: { month } }),
  ]);

  const totalOverheads = overheads.reduce((s, o) => s + Number(o.amountPln), 0);
  const overheadShare = totalOverheads / 2;

  // Resolve income + compute per-jar contributions for every user
  const userContributions: Record<number, Record<number, number>> = {};
  const userDiscretionary: Record<number, number> = {};
  const sharedJars = allJars.filter(j => !j.isPersonal);

  for (const u of allUsers) {
    const income = await resolveIncomeForUser(u.id, month);
    const deductions = await prisma.personalDeduction.findMany({ where: { userId: u.id, active: true } });
    const deductTotal = deductions.reduce((s, d) => s + Number(d.amountPln), 0);
    const disc = income - overheadShare - deductTotal;
    userDiscretionary[u.id] = disc;
    userContributions[u.id] = {};
    for (const jar of sharedJars) {
      const fixed = (jar as any).fixedAmountPln;
      userContributions[u.id][jar.id] = fixed != null ? Number(fixed) : jar.isFood ? 1000 : (disc * Number(jar.percent)) / 100;
    }
  }

  const targetJars = jarHint
    ? (() => { const m = fuzzyFindJar(jarHint, sharedJars); return m ? [m.jar] : []; })()
    : sharedJars;

  if (targetJars.length === 0) return ctx.reply(`Couldn't find that jar.`);

  const lines: string[] = [];

  for (const jar of targetJars) {
    const [expenses, transfers, topUps] = await Promise.all([
      prisma.expense.findMany({ where: { jarId: jar.id, date: { gte: startOfMonth, lt: endOfMonth } } }),
      prisma.jarTransfer.findMany({ where: { jarId: jar.id, date: { gte: startOfMonth, lt: endOfMonth } } }),
      prisma.jarTopUp.findMany({ where: { jarId: jar.id, date: { gte: startOfMonth, lt: endOfMonth } } }),
    ]);

    const totalTopUpsAmt = topUps.reduce((s, t) => s + Number(t.amountPln), 0);
    const totalSpend = expenses.reduce((s, e) => s + Number(e.amountPln), 0);
    const totalContrib = allUsers.reduce((s, u) => s + (userContributions[u.id]?.[jar.id] ?? 0), 0);

    // Per-person carry-forwards (same source as dashboard)
    const myPersonCarry = personCarryForwards.find(c => c.jarId === jar.id && c.userId === user.id);
    const totalOpening = allUsers.reduce((s, u) => {
      const c = personCarryForwards.find(pc => pc.jarId === jar.id && pc.userId === u.id);
      return s + (c ? Number(c.amount) : 0);
    }, 0);

    const myOpening = myPersonCarry ? Number(myPersonCarry.amount) : 0;
    const myContrib = userContributions[user.id]?.[jar.id] ?? 0;
    const mySpend = expenses.filter(e => e.userId === user.id).reduce((s, e) => s + Number(e.amountPln), 0);
    const myTransfersIn = transfers.filter(t => t.toUserId === user.id).reduce((s, t) => s + Number(t.amountPln), 0);
    const myTransfersOut = transfers.filter(t => t.fromUserId === user.id).reduce((s, t) => s + Number(t.amountPln), 0);
    const myTopUps = topUps.filter(t => t.userId === user.id).reduce((s, t) => s + Number(t.amountPln), 0);
    const myBalance = myContrib + myOpening - mySpend + myTransfersIn - myTransfersOut + myTopUps;

    const commonBalance = totalContrib + totalOpening - totalSpend + totalTopUpsAmt;

    const carryNote = myOpening !== 0 ? ` (carry ${myOpening > 0 ? '+' : ''}${fmt(myOpening)})` : '';
    lines.push(
      `*${jar.name}*\n` +
      `  You: ${fmt(myBalance)} PLN${carryNote}\n` +
      `  Common: ${fmt(commonBalance)} PLN · Day ${today}/${daysInMonth}`
    );
  }

  if (isPrivate && !jarHint) {
    const personalJar = allJars.find(j => j.isPersonal);
    if (personalJar) {
      const personalExpenses = await prisma.expense.findMany({
        where: { jarId: personalJar.id, userId: user.id, date: { gte: startOfMonth, lt: endOfMonth } },
      });
      const personalSpent = personalExpenses.reduce((s, e) => s + Number(e.amountPln), 0);
      const disc = userDiscretionary[user.id] ?? 0;
      const sharedContribs = sharedJars.reduce((s, j) => s + (userContributions[user.id]?.[j.id] ?? 0), 0);
      lines.push(`*Personal jar*\n  ${fmt(disc - sharedContribs - personalSpent)} PLN`);
    }
  }

  await ctx.reply(lines.join('\n\n') || 'No jars found.', { parse_mode: 'Markdown' });
}

// ── Expense logging ───────────────────────────────────────────────────────────

export async function handleExpenseText(ctx: BotContext) {
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (!user) return ctx.reply(`Your Telegram isn't linked yet.\n\n1. Open the app → Account\n2. Tap "Generate code"\n3. Send the 6-digit code here`);

  const text = ctx.message?.text ?? '';
  const parsed = parseExpenseAmount(text);
  if (!parsed) return;

  const { amount, currency, rest } = parsed;
  const jars = await getActiveJars();
  const { jar: matchedJarFromText, description } = extractJarAndDescription(rest, jars);

  // Handle non-PLN rates
  let rate: number | undefined;
  if (currency !== 'PLN') {
    if (currency === 'BYN') {
      ctx.session.expense = { step: 'awaiting_rate', amount, currency, description };
      return ctx.reply(
        `No BYN rate available. Enter the rate (1 BYN = ? PLN):`,
        { reply_markup: { inline_keyboard: [[{ text: 'Cancel', callback_data: 'cancel' }]] } }
      );
    }
    const fetched = await getNBPRate(currency);
    if (!fetched) {
      ctx.session.expense = { step: 'awaiting_rate', amount, currency, description };
      return ctx.reply(
        `Couldn't fetch ${currency} rate. Enter the rate (1 ${currency} = ? PLN):`,
        { reply_markup: { inline_keyboard: [[{ text: 'Cancel', callback_data: 'cancel' }]] } }
      );
    }
    rate = fetched;
  }

  const amountPln = currency === 'PLN' ? amount : amount * rate!;
  const matchedJar = matchedJarFromText ?? undefined;

  // No jar matched → show jar picker
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

  const { amount = 0, currency = 'PLN', description } = session;
  const amountPln = amount * rate;
  const jars = await getActiveJars();

  // After rate input, always show jar picker
  ctx.session.expense = { step: 'pick_jar', amount, currency, rate, description };
  const keyboard = [
    ...jars.map((j) => [{ text: j.name, callback_data: `jar:${j.id}:${j.name}` }]),
    [{ text: 'No jar (save uncategorised)', callback_data: 'jar:null:No jar' }],
    [{ text: 'Cancel', callback_data: 'cancel' }],
  ];
  await ctx.reply(`${fmt(amount)} ${currency} (${fmt(amountPln)} PLN) — which jar?`, { reply_markup: { inline_keyboard: keyboard } });
  return true;
}

export async function handleDescriptionInput(ctx: BotContext) {
  await showConfirmation(ctx);
}

async function saveExpense(ctx: BotContext) {
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (!user) return ctx.editMessageText(`Account not linked. Go to the app → Account and send the 6-digit code here.`);

  const session = ctx.session.expense;
  if (!session) return ctx.editMessageText('Session expired — please re-send the expense (e.g. "50 eating out").');

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
