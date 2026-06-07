// ── Currency normalisation ────────────────────────────────────────────────────

const CURRENCY_ALIASES: Record<string, string> = {
  pln: 'PLN', zl: 'PLN', 'zł': 'PLN', zloty: 'PLN', zlotych: 'PLN',
  usd: 'USD', dollar: 'USD', dollars: 'USD',
  eur: 'EUR', euro: 'EUR', euros: 'EUR',
  byn: 'BYN', bel: 'BYN', belarusian: 'BYN',
};

export function normalizeCurrency(word: string): string | null {
  return CURRENCY_ALIASES[word.toLowerCase()] ?? null;
}

// ── Levenshtein + similarity ──────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / Math.max(a.length, b.length);
}

// ── Jar fuzzy matching ────────────────────────────────────────────────────────

export interface JarLike { id: number; name: string }

const CONFIDENCE_THRESHOLD = 0.55;

export function fuzzyFindJar<T extends JarLike>(
  text: string,
  jars: T[]
): { jar: T; confidence: number; matchedTokens: number[] } | null {
  if (!text.trim()) return null;

  const tokens = text.toLowerCase().split(/\s+/);
  let best: { jar: T; confidence: number; matchedTokens: number[] } | null = null;

  for (const jar of jars) {
    // Build comparison targets: full name + each significant word
    const jarTokens = jar.name.toLowerCase().split(/[\s&]+/).filter(w => w.length > 2);
    const jarFull = jarTokens.join(' ');

    // Try every window of 1–3 consecutive tokens in the input
    for (let i = 0; i < tokens.length; i++) {
      for (let len = 1; len <= Math.min(3, tokens.length - i); len++) {
        const chunk = tokens.slice(i, i + len).join(' ');
        const indices = Array.from({ length: len }, (_, k) => i + k);

        // Score: max of full-name match and best single-word match
        const scores = [
          similarity(chunk, jarFull),
          ...jarTokens.map(jw => similarity(chunk, jw)),
        ];
        const score = Math.max(...scores);

        if (score > CONFIDENCE_THRESHOLD && score > (best?.confidence ?? 0)) {
          best = { jar, confidence: score, matchedTokens: indices };
        }
      }
    }
  }

  return best;
}

// ── Balance intent detection ──────────────────────────────────────────────────

const BALANCE_PATTERNS = [
  /^(?:how much (?:is )?in|what'?s left in|balance in)\s+(.+)$/,
  /^how much\s+(.+)$/,
  /^(.+?)\s+(?:balance|how much|left)$/,
  /^(?:balance|what'?s left|how much)$/,
  /^check\s+(.+)$/,
];

export function parseBalanceIntent(text: string): { isBalance: boolean; jarHint?: string } {
  const t = text.toLowerCase().trim()
    .replace(/^\/balance\s*/, '')   // strip /balance prefix
    .replace(/[?!]+$/, '')          // strip trailing punctuation
    .trim();

  // Pure balance commands
  if (['balance', 'balances', "what's left", 'whats left', 'how much'].includes(t)) {
    return { isBalance: true };
  }

  for (const pattern of BALANCE_PATTERNS) {
    const m = t.match(pattern);
    if (m) {
      const jarHint = m[1]?.trim();
      return { isBalance: true, jarHint: jarHint || undefined };
    }
  }

  return { isBalance: false };
}

// ── Expense parsing ───────────────────────────────────────────────────────────

const FILLER_WORDS = new Set([
  'spent', 'spend', 'paid', 'pay', 'bought', 'buy',
  'on', 'for', 'in', 'at', 'a', 'the', 'an',
]);

export interface ParsedExpense {
  amount: number;
  currency: string;
  rest: string; // cleaned text without amount/currency/fillers
}

export function parseExpenseAmount(raw: string): ParsedExpense | null {
  const t = raw.trim();

  // Find the first number
  const numMatch = t.match(/(\d+(?:[.,]\d+)?)/);
  if (!numMatch) return null;
  const amount = parseFloat(numMatch[1].replace(',', '.'));
  if (isNaN(amount) || amount <= 0) return null;

  // Look for currency adjacent to the number — only remove it from rest if it IS a currency
  let currency = 'PLN';
  const beforeNum = t.slice(0, numMatch.index!).trim().split(/\s+/).pop() ?? '';
  const afterNum = t.slice(numMatch.index! + numMatch[1].length).trim().split(/\s+/)[0] ?? '';

  const currBefore = normalizeCurrency(beforeNum);
  const currAfter = normalizeCurrency(afterNum);

  let rest = t.replace(numMatch[1], ' '); // remove the number

  if (currAfter) {
    currency = currAfter;
    rest = rest.replace(new RegExp(`\\b${afterNum}\\b`, 'i'), ' '); // remove currency word
  } else if (currBefore) {
    currency = currBefore;
    rest = rest.replace(new RegExp(`\\b${beforeNum}\\b`, 'i'), ' '); // remove currency word
  }

  // Strip filler words
  rest = rest
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => !FILLER_WORDS.has(w.toLowerCase()))
    .join(' ')
    .trim();

  return { amount, currency, rest };
}

// Given cleaned rest text + jar list, extract jar and description
export function extractJarAndDescription<T extends JarLike>(
  rest: string,
  jars: T[]
): { jar: T | null; description: string | undefined } {
  if (!rest) return { jar: null, description: undefined };

  const result = fuzzyFindJar(rest, jars);
  if (!result) return { jar: null, description: rest || undefined };

  const tokens = rest.toLowerCase().split(/\s+/);
  const descTokens = tokens.filter((_, i) => !result.matchedTokens.includes(i));
  const description = descTokens.length > 0 ? descTokens.join(' ') : undefined;

  return { jar: result.jar, description };
}
