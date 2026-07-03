-- Add fixedAmountPln column to Jar (null = % mode, value = fixed PLN per person)
ALTER TABLE "Jar" ADD COLUMN "fixedAmountPln" DECIMAL(65,30);

-- Seed the food jar with 1000 PLN per person (was hardcoded in budgetService)
UPDATE "Jar" SET "fixedAmountPln" = 1000 WHERE "isFood" = true;
