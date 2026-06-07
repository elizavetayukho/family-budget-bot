import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getRate, setManualRate, getManualRate } from '../services/rateService';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  const results: Record<string, unknown> = {};

  for (const currency of ['USD', 'EUR'] as const) {
    const manual = getManualRate(currency);
    if (manual) {
      results[currency] = { rate: manual, source: 'manual' };
      continue;
    }
    try {
      results[currency] = await getRate(currency);
    } catch {
      results[currency] = { rate: null, source: 'unavailable', error: `Couldn't fetch rate. Enter manually.` };
    }
  }

  results['BYN'] = {
    rate: getManualRate('BYN') ?? null,
    source: getManualRate('BYN') ? 'manual' : 'unavailable',
    error: getManualRate('BYN') ? undefined : 'No live BYN rate. Enter rate manually.',
  };

  res.json(results);
});

router.post('/manual', requireAuth, (req, res) => {
  const { currency, rate } = req.body;
  if (!currency || rate == null) return res.status(400).json({ error: 'currency and rate required' });
  setManualRate(currency, Number(rate));
  res.json({ ok: true });
});

export default router;
