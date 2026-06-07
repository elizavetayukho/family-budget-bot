-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "telegramId" TEXT,
    "telegramLinkCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Income" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "brutto" DECIMAL(65,30) NOT NULL,
    "netto" DECIMAL(65,30),
    "bruttoHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Overhead" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "amountPln" DECIMAL(65,30) NOT NULL,
    "isOneOff" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Overhead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jar" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "isFood" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Jar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "jarId" INTEGER,
    "amountPln" DECIMAL(65,30) NOT NULL,
    "originalAmount" DECIMAL(65,30) NOT NULL,
    "originalCurrency" TEXT NOT NULL DEFAULT 'PLN',
    "exchangeRate" DECIMAL(65,30),
    "isManualRate" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalDeduction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amountPln" DECIMAL(65,30) NOT NULL,
    "isOneOff" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlySnapshot" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "carryForwards" JSONB NOT NULL,
    "foodOverspend" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarCarryForward" (
    "id" SERIAL NOT NULL,
    "jarId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "JarCarryForward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UncategorisedReminder" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expenseCount" INTEGER NOT NULL,

    CONSTRAINT "UncategorisedReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Income_userId_month_key" ON "Income"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySnapshot_month_key" ON "MonthlySnapshot"("month");

-- CreateIndex
CREATE UNIQUE INDEX "JarCarryForward_jarId_month_key" ON "JarCarryForward"("jarId", "month");

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "Jar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalDeduction" ADD CONSTRAINT "PersonalDeduction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JarCarryForward" ADD CONSTRAINT "JarCarryForward_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "Jar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UncategorisedReminder" ADD CONSTRAINT "UncategorisedReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

