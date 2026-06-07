import { Context, SessionFlavor } from 'grammy';

export interface ExpenseSession {
  step?: 'confirm' | 'pick_jar' | 'awaiting_rate' | 'confirm_with_jar' | 'awaiting_description';
  amount?: number;
  currency?: string;
  jarId?: number | null;
  jarName?: string;
  jarHint?: string;
  description?: string;
  rate?: number;
  messageId?: number;
}

export type SessionData = { expense?: ExpenseSession };
export type BotContext = Context & SessionFlavor<SessionData>;
