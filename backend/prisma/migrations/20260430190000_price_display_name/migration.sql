-- AlterTable (IF NOT EXISTS so manual `db execute` / DBA reruns are safe)
ALTER TABLE "Price" ADD COLUMN IF NOT EXISTS "name" TEXT;
