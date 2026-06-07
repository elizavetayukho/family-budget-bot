import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { sendPasswordReset } from '../services/emailService';

const router = Router();
const prisma = new PrismaClient();

// Store reset tokens in memory (simple, private app)
const resetTokens = new Map<string, { userId: number; createdAt: number }>();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Wrong email or password.' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Wrong email or password.' });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!
    // no expiry — per spec
  );

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });

  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorised' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: number; email: string; role: string };
    // Return user from DB to get fresh name
    prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, name: true, email: true, role: true } })
      .then((u) => u ? res.json(u) : res.status(401).json({ error: 'User not found' }));
  } catch {
    res.status(401).json({ error: 'Unauthorised' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.post('/reset-password/request', async (req, res) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Don't reveal if email exists
    return res.json({ ok: true });
  }

  const token = crypto.randomBytes(32).toString('hex');
  resetTokens.set(token, { userId: user.id, createdAt: Date.now() });

  try {
    await sendPasswordReset(user.email, token);
  } catch (e) {
    console.error('Failed to send reset email:', e);
  }

  res.json({ ok: true });
});

router.post('/reset-password/confirm', async (req, res) => {
  const { token, newPassword } = req.body;
  const entry = resetTokens.get(token);
  if (!entry) return res.status(400).json({ error: 'Invalid or expired token' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: entry.userId }, data: { passwordHash } });
  resetTokens.delete(token);

  res.json({ ok: true });
});

export default router;
