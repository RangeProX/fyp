-- AlterTable
ALTER TABLE "events" ADD COLUMN "recurrence_type" TEXT;
ALTER TABLE "events" ADD COLUMN "recurrence_end" DATETIME;
ALTER TABLE "events" ADD COLUMN "recurrence_group_id" TEXT;
