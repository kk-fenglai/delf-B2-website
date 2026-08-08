-- Add exam level to ExamSet. DEFAULT 'B2' IS the backfill: all existing rows
-- get 'B2' atomically (metadata-only on PG 11+), no NULL window, no script.
ALTER TABLE "ExamSet" ADD COLUMN "level" TEXT NOT NULL DEFAULT 'B2';

-- CreateIndex
CREATE INDEX "ExamSet_level_source_isPublished_idx" ON "ExamSet"("level", "source", "isPublished");
