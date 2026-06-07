import 'dotenv/config';
import { Bot, session, InlineKeyboard } from 'grammy';
import { BotContext, SessionData } from './session';
import {
  handleBalance,
  handleExpenseText,
  handleCallback,
  handleRateInput,
  handleDescriptionInput,
  handleLinkCode,
  resolveUser,
} from './handlers';
import prisma from './db';

const WEB_URL = process.env.WEB_APP_URL ?? 'http://localhost:5173';

const bot = new Bot<BotContext>(process.env.TELEGRAM_BOT_TOKEN!);

bot.use(session<SessionData, BotContext>({
  initial: (): SessionData => ({}),
}));

// Set the command menu that appears when user taps the input field
bot.api.setMyCommands([
  { command: 'start', description: 'Start / re-link account' },
  { command: 'balance', description: 'Check all jar balances' },
  { command: 'jars', description: 'Pick a jar to check balance' },
  { command: 'help', description: 'How to log expenses' },
]);

// ── /start ────────────────────────────────────────────────────────────────────
bot.command('start', async (ctx) => {
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (user) {
    await ctx.reply(
      `Welcome back, ${user.name}!\n\nYou can:\n• Send an expense: <i>spent 45 on eating out for pizza</i>\n• Check balances: /balance or /jars\n• Check one jar: /balance vacation`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply(
      `To get started, link your account:\n1. Open the app at ${WEB_URL}/account\n2. Click "Generate code"\n3. Send the 6-digit code here`
    );
  }
});

// ── /help ─────────────────────────────────────────────────────────────────────
bot.command('help', async (ctx) => {
  await ctx.reply(
    `<b>Logging expenses:</b>\n` +
    `• <code>spent 45 on eating out</code>\n` +
    `• <code>45 eating out for pizza</code>\n` +
    `• <code>50 USD on vacation</code>\n` +
    `• If no jar is recognised, you'll get a picker\n\n` +
    `<b>Checking balances:</b>\n` +
    `• /balance — all jars\n` +
    `• /jars — tap a jar button\n` +
    `• /balance vacation — specific jar\n` +
    `• <code>how much in safety</code>`,
    { parse_mode: 'HTML' }
  );
});

// ── /balance — show all jars as text ─────────────────────────────────────────
bot.command('balance', async (ctx) => {
  const args = ctx.match?.trim();
  await handleBalance(ctx, args || undefined);
});

// ── /jars — show jar buttons to tap ──────────────────────────────────────────
bot.command('jars', async (ctx) => {
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (!user) return ctx.reply(`Link your Telegram account first at ${WEB_URL}/account`);

  const jars = await prisma.jar.findMany({ where: { status: 'ACTIVE', isPersonal: false } });

  const keyboard = new InlineKeyboard();
  jars.forEach((jar, i) => {
    keyboard.text(jar.name, `checkjar:${jar.id}:${jar.name}`);
    // Two buttons per row
    if (i % 2 === 1) keyboard.row();
  });
  keyboard.row().text('All jars', 'checkjar:all:All jars');

  await ctx.reply('Which jar do you want to check?', { reply_markup: keyboard });
});

// ── Inline keyboard callbacks ─────────────────────────────────────────────────
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;

  // Jar balance check buttons from /jars
  if (data.startsWith('checkjar:')) {
    await ctx.answerCallbackQuery();
    const parts = data.split(':');
    const jarId = parts[1];
    const jarName = parts.slice(2).join(':');

    if (jarId === 'all') {
      await handleBalance(ctx as unknown as BotContext, undefined);
    } else {
      await handleBalance(ctx as unknown as BotContext, jarName);
    }
    return;
  }

  // Expense flow callbacks
  await handleCallback(ctx);
});

// ── Text messages ─────────────────────────────────────────────────────────────
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const lower = text.toLowerCase();

  // Balance check by keyword
  if (lower === 'balance' || lower.startsWith('how much in ')) {
    const hint = lower.replace('how much in ', '').trim();
    return handleBalance(ctx, hint || undefined);
  }

  // Account linking: 6-digit code
  if (/^\d{6}$/.test(text)) {
    const linked = await handleLinkCode(ctx);
    if (linked) return;
  }

  // Rate input mid-conversation
  if (ctx.session.expense?.step === 'awaiting_rate') {
    const handled = await handleRateInput(ctx);
    if (handled) return;
  }

  // Description input mid-conversation
  if (ctx.session.expense?.step === 'awaiting_description') {
    ctx.session.expense = { ...ctx.session.expense, description: text };
    await handleDescriptionInput(ctx);
    return;
  }

  // Expense parsing: anything with a number in it
  if (/\d/.test(text)) {
    await handleExpenseText(ctx);
    return;
  }

  // Unrecognised
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (!user) {
    await ctx.reply(`Link your Telegram account first at ${WEB_URL}/account`);
  } else {
    await ctx.reply(
      `I didn't understand that. Try:\n• <code>spent 45 on eating out</code>\n• /jars to check balances\n• /help for all commands`,
      { parse_mode: 'HTML' }
    );
  }
});

bot.catch((err) => {
  console.error('[Bot error]', err);
});

bot.start();
console.log('Bot running.');
