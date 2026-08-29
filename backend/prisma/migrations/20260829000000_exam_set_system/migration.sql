-- Add exam system to ExamSet (PRD 2026-08-29 IELTS 接入, 迁移 A). Same pattern
-- as 20260726000000_exam_set_level: DEFAULT 'DELF' IS the backfill — all
-- existing rows get 'DELF' atomically (metadata-only on PG 11+), no NULL
-- window, no script.
ALTER TABLE "ExamSet" ADD COLUMN "system" TEXT NOT NULL DEFAULT 'DELF';

-- CreateIndex
CREATE INDEX "ExamSet_system_level_source_isPublished_idx" ON "ExamSet"("system", "level", "source", "isPublished");
