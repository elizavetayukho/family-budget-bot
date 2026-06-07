import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.post('/telegram/generate-code', requireAuth, async (req, res) => {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { telegramLinkCode: code },
  });
  res.json({ code });
});

router.post('/telegram/confirm', async (req, res) => {
  const { code, telegramId } = req.body;
  if (!code || !telegramId) return res.status(400).json({ error: 'code and telegramId required' });

  const user = await prisma.user.findFirst({ where: { telegramLinkCode: code } });
  if (!user) return res.status(400).json({ error: 'Invalid code' });

  await prisma.user.update({
    where: { id: user.id },
    data: { telegramId: String(telegramId), telegramLinkCode: null },
  });

  res.json({ ok: true, userId: user.id, name: user.name });
});

export default router;
