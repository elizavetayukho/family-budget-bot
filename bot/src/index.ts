import 'dotenv/config';
import { Bot, session } from 'grammy';
import { BotContext, SessionData } from './session';
import {
  handleBalance,
  handleExpenseText,
  handleCallback,
  handleRateInput,
  handleLinkCode,
  resolveUser,
} from './handlers';

const WEB_URL = process.env.WEB_APP_URL ?? 'http://localhost:5173';

const bot = new Bot<BotContext>(process.env.TELEGRAM_BOT_TOKEN!);

bot.use(session<SessionData, BotContext>({
  initial: (): SessionData => ({}),
}));

// ── /start ────────────────────────────────────────────────────────────────────
bot.command('start', async (ctx) => {
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (user) {
    await ctx.reply(`Welcome back, ${user.name}! Send an expense or /balance to check your jars.`);
  } else {
    await ctx.reply(
      `Link your Telegram account first at ${WEB_URL}/account\n\nGenerate a 6-digit code there and send it here.`
    );
  }
});

// ── /balance ──────────────────────────────────────────────────────────────────
bot.command('balance', async (ctx) => {
  const args = ctx.match?.trim();
  await handleBalance(ctx, args || undefined);
});

// ── Inline keyboard callbacks ─────────────────────────────────────────────────
bot.on('callback_query:data', handleCallback);

// ── Text messages ─────────────────────────────────────────────────────────────
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim().toLowerCase();

  // Balance check by keyword
  if (text === 'balance' || text.startsWith('how much in ') || text.startsWith('/balance ')) {
    const hint = text.replace('how much in ', '').replace('/balance ', '').trim();
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

  // Expense parsing: anything with a number in it
  if (/\d/.test(text)) {
    await handleExpenseText(ctx);
    return;
  }

  // Unrecognised — check if user is linked
  const telegramId = String(ctx.from!.id);
  const user = await resolveUser(telegramId);
  if (!user) {
    await ctx.reply(`Link your Telegram account first at ${WEB_URL}/account`);
  }
});

bot.catch((err) => {
  console.error('[Bot error]', err);
});

bot.start();
console.log('Bot running.');
