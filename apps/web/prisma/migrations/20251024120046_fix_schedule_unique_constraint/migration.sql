/*
  Warnings:

  - A unique constraint covering the columns `[emailAccountId,timeOfDay,intervalDays,daysOfWeek]` on the table `Schedule` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX IF EXISTS "Schedule_emailAccountId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_emailAccountId_timeOfDay_intervalDays_daysOfWeek_key" ON "Schedule"("emailAccountId", "timeOfDay", "intervalDays", "daysOfWeek");

-- CreateIndex (if not exists)
CREATE INDEX IF NOT EXISTS "Schedule_emailAccountId_idx" ON "Schedule"("emailAccountId");

-- CreateIndex (if not exists)
CREATE INDEX IF NOT EXISTS "Schedule_nextOccurrenceAt_idx" ON "Schedule"("nextOccurrenceAt");

