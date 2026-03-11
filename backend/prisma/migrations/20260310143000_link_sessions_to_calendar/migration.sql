-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "started_at" DATETIME;
ALTER TABLE "sessions" ADD COLUMN "ended_at" DATETIME;
ALTER TABLE "sessions" ADD COLUMN "calendar_event_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_calendar_event_id_key" ON "sessions"("calendar_event_id");
