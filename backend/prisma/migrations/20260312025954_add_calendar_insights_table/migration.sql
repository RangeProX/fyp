-- CreateTable
CREATE TABLE "calendar_insights" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "observation" TEXT NOT NULL,
    "concern" TEXT,
    "suggestion" TEXT NOT NULL,
    "encouragement" TEXT NOT NULL,
    "urgentActions" TEXT,
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" DATETIME NOT NULL,
    "events_analyzed" INTEGER NOT NULL,
    "time_window_start" DATETIME NOT NULL,
    "time_window_end" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "start_time" DATETIME NOT NULL,
    "end_time" DATETIME NOT NULL,
    "notes" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3788d8',
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "rrule" TEXT,
    "exdates" TEXT,
    "series_id" TEXT,
    "owner_id" INTEGER NOT NULL,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME
);
INSERT INTO "new_events" ("color", "created_at", "end_time", "exdates", "id", "notes", "owner_id", "rrule", "series_id", "start_time", "title", "updated_at", "visibility") SELECT "color", "created_at", "end_time", "exdates", "id", "notes", "owner_id", "rrule", "series_id", "start_time", "title", "updated_at", "visibility" FROM "events";
DROP TABLE "events";
ALTER TABLE "new_events" RENAME TO "events";
CREATE INDEX "events_owner_id_idx" ON "events"("owner_id");
CREATE INDEX "events_series_id_idx" ON "events"("series_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "calendar_insights_user_id_idx" ON "calendar_insights"("user_id");

-- CreateIndex
CREATE INDEX "calendar_insights_generated_at_idx" ON "calendar_insights"("generated_at");
