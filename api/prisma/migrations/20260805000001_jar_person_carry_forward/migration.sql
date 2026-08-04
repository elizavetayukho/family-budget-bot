CREATE TABLE "JarPersonCarryForward" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "jarId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "JarPersonCarryForward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JarPersonCarryForward_userId_jarId_month_key" ON "JarPersonCarryForward"("userId", "jarId", "month");

ALTER TABLE "JarPersonCarryForward" ADD CONSTRAINT "JarPersonCarryForward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JarPersonCarryForward" ADD CONSTRAINT "JarPersonCarryForward_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "Jar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
