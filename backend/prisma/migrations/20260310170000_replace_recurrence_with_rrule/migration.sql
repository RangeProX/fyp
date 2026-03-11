-- Drop old server-side recurrence columns
ALTER TABLE "events" DROP COLUMN "recurrence_type";
ALTER TABLE "events" DROP COLUMN "recurrence_end";
ALTER TABLE "events" DROP COLUMN "recurrence_group_id";

-- Add rrule column for FullCalendar rrule plugin
ALTER TABLE "events" ADD COLUMN "rrule" TEXT;
