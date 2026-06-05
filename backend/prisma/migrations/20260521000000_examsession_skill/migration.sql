-- AlterTable
ALTER TABLE "ExamSession" ADD COLUMN "skill" TEXT;

-- CreateIndex
CREATE INDEX "ExamSession_userId_mode_skill_startedAt_idx" ON "ExamSession"("userId", "mode", "skill", "startedAt");
