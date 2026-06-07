import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.post('/', requireAuth, async (req, res) => {
  const {
    amountPln, originalAmount, originalCurrency = 'PLN',
    exchangeRate, isManualRate = false,
    jarId, description, date, userId: bodyUserId,
  } = req.body;

  const isAdmin = req.user!.role === 'ADMIN';
  const targetUserId = bodyUserId && isAdmin ? Number(bodyUserId) : req.user!.id;

  if (jarId) {
    const jar = await prisma.jar.findUnique({ where: { id: jarId } });
    if (!jar) return res.status(404).json({ error: 'Jar not found' });
    if (jar.status === 'ARCHIVED') return res.status(400).json({ error: 'Jar is archived' });
  }

  const expense = await prisma.expense.create({
    data: {
      userId: targetUserId,
      jarId: jarId ?? null,
      amountPln,
      originalAmount,
      originalCurrency,
      exchangeRate: exchangeRate ?? null,
      isManualRate,
      description: description ?? null,
      date: new Date(date),
    },
  });

  res.status(201).json(expense);
});

router.patch('/:id', requireAuth, async (req, res) => {
  const expense = await prisma.expense.findUnique({ where: { id: Number(req.params.id) } });
  if (!expense) return res.status(404).json({ error: 'Not found' });
  const isAdmin = req.user!.role === 'ADMIN';
  if (expense.userId !== req.user!.id && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const {
    amountPln, originalAmount, originalCurrency,
    exchangeRate, isManualRate, jarId, description, date,
  } = req.body;

  const updated = await prisma.expense.update({
    where: { id: expense.id },
    data: {
      amountPln: amountPln ?? expense.amountPln,
      originalAmount: originalAmount ?? expense.originalAmount,
      originalCurrency: originalCurrency ?? expense.originalCurrency,
      exchangeRate: exchangeRate !== undefined ? exchangeRate : expense.exchangeRate,
      isManualRate: isManualRate ?? expense.isManualRate,
      jarId: jarId !== undefined ? jarId : expense.jarId,
      description: description !== undefined ? description : expense.description,
      date: date ? new Date(date) : expense.date,
    },
  });

  res.json(updated);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const expense = await prisma.expense.findUnique({ where: { id: Number(req.params.id) } });
  if (!expense) return res.status(404).json({ error: 'Not found' });
  const isAdmin = req.user!.role === 'ADMIN';
  if (expense.userId !== req.user!.id && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

  await prisma.expense.delete({ where: { id: expense.id } });
  res.json({ ok: true });
});

router.get('/', requireAuth, async (req, res) => {
  const {
    jarId, userId, dateFrom, dateTo,
    minAmount, maxAmount, currency,
    sort = 'date_desc', uncategorised,
  } = req.query;

  const requesterId = req.user!.id;
  const isAdmin = req.user!.role === 'ADMIN';

  // Privacy: if filtering by userId, must be own or admin
  let targetUserId: number | undefined;
  if (userId) {
    targetUserId = Number(userId);
    if (targetUserId !== requesterId && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const where: Record<string, unknown> = {};

  // Personal jar privacy: only return own personal jar expenses
  if (jarId) {
    const jar = await prisma.jar.findUnique({ where: { id: Number(jarId) } });
    if (jar?.isPersonal) {
      where.userId = requesterId;
      where.jarId = Number(jarId);
    } else {
      where.jarId = Number(jarId);
      if (targetUserId) where.userId = targetUserId;
    }
  } else if (uncategorised === 'true') {
    where.jarId = null;
    where.userId = targetUserId ?? requesterId;
  } else {
    // For non-personal jar queries, allow shared jar data but filter personal
    if (targetUserId) {
      where.userId = targetUserId;
    }
    // Exclude other user's personal jar expenses
    const personalJar = await prisma.jar.findFirst({ where: { isPersonal: true } });
    if (personalJar && !targetUserId) {
      where.OR = [
        { jarId: { not: personalJar.id } },
        { jarId: null },
        { userId: requesterId, jarId: personalJar.id },
      ];
    }
  }

  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom ? { gte: new Date(dateFrom as string) } : {}),
      ...(dateTo ? { lte: new Date(dateTo as string) } : {}),
    };
  }
  if (minAmount || maxAmount) {
    where.amountPln = {
      ...(minAmount ? { gte: Number(minAmount) } : {}),
      ...(maxAmount ? { lte: Number(maxAmount) } : {}),
    };
  }
  if (currency) where.originalCurrency = currency;

  const orderBy = (() => {
    switch (sort) {
      case 'date_asc': return { date: 'asc' as const };
      case 'amount_desc': return { amountPln: 'desc' as const };
      case 'amount_asc': return { amountPln: 'asc' as const };
      default: return { date: 'desc' as const };
    }
  })();

  const expenses = await prisma.expense.findMany({
    where,
    orderBy,
    include: { jar: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } },
  });

  res.json(expenses);
});

export default router;
