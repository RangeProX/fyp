-- AlterTable
ALTER TABLE "files" ADD COLUMN "file_type" TEXT NOT NULL DEFAULT 'NOTES';

-- AlterTable
ALTER TABLE "files" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PRIVATE';
