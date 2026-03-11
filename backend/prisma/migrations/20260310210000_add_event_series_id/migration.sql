-- AlterTable
ALTER TABLE "events" ADD COLUMN "series_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "events_series_id_idx" ON "events"("series_id");
