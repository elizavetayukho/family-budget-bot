// Sends messages via the Telegram Bot API directly (used by cron jobs).
// The bot process also uses Grammy for interactive flows — this is fire-and-forget.

import fetch from 'node-fetch';

const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendMessage(telegramId: string, text: string): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`${BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.error(`Failed to send Telegram message to ${telegramId}:`, e);
  }
}
