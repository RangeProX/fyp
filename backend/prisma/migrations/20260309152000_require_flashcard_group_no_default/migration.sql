-- RedefineTable
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_saved_flashcards" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "group_name" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_saved_flashcards" ("back", "created_at", "front", "group_name", "id", "user_id") SELECT "back", "created_at", "front", "group_name", "id", "user_id" FROM "saved_flashcards";
DROP TABLE "saved_flashcards";
ALTER TABLE "new_saved_flashcards" RENAME TO "saved_flashcards";
CREATE INDEX "saved_flashcards_user_id_idx" ON "saved_flashcards"("user_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;