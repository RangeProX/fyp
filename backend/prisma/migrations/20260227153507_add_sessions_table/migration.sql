-- CreateTable
CREATE TABLE "sessions" (
    "session_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "session_title" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "focus_level" INTEGER NOT NULL,
    "goals" TEXT,
    "remarks" TEXT,
    "progress" TEXT,
    "paused_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
