import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const lizHash = await bcrypt.hash('changeme123', 10);
  const edgarHash = await bcrypt.hash('changeme123', 10);

  const lizaveta = await prisma.user.upsert({
    where: { email: 'lizaveta@family.local' },
    update: {},
    create: {
      name: 'Lizaveta',
      email: 'lizaveta@family.local',
      passwordHash: lizHash,
      role: 'ADMIN',
    },
  });

  const edgar = await prisma.user.upsert({
    where: { email: 'edgar@family.local' },
    update: {},
    create: {
      name: 'Edgar',
      email: 'edgar@family.local',
      passwordHash: edgarHash,
      role: 'USER',
    },
  });

  // Default overhead: Food 2000 PLN
  await prisma.overhead.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Food',
      amountPln: 2000,
      isOneOff: false,
      active: true,
    },
  });

  // Default jars
  const jarsData = [
    { name: 'Food', percent: 0, isFood: true, isPersonal: false },
    { name: 'Eating Out', percent: 5, isFood: false, isPersonal: false },
    { name: 'Health & Beauty', percent: 2.5, isFood: false, isPersonal: false },
    { name: 'Entertainment', percent: 2.5, isFood: false, isPersonal: false },
    { name: 'House', percent: 2.5, isFood: false, isPersonal: false },
    { name: 'Safety', percent: 5, isFood: false, isPersonal: false },
    { name: 'Vacation', percent: 5, isFood: false, isPersonal: false },
    { name: 'Personal', percent: 0, isFood: false, isPersonal: true },
  ];

  for (const jarData of jarsData) {
    const existing = await prisma.jar.findFirst({ where: { name: jarData.name } });
    if (!existing) {
      await prisma.jar.create({ data: jarData });
    }
  }

  // Lizaveta's personal deductions
  const existingDed = await prisma.personalDeduction.findFirst({ where: { userId: lizaveta.id } });
  if (!existingDed) {
    await prisma.personalDeduction.createMany({
      data: [
        { userId: lizaveta.id, name: 'University savings', amountPln: 300 },
        { userId: lizaveta.id, name: 'IKZE', amountPln: 200 },
      ],
    });
  }

  console.log('Seed complete.');
  console.log('  Lizaveta:', lizaveta.email, '(ADMIN)');
  console.log('  Edgar:', edgar.email, '(USER)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
