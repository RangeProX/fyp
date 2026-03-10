-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "ai_insight_status" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "sessions" ADD COLUMN "ai_insight" TEXT;
ALTER TABLE "sessions" ADD COLUMN "ai_insight_reason" TEXT;
ALTER TABLE "sessions" ADD COLUMN "ai_insight_generated_at" DATETIME;