-- User-owned exam sets ("我的题库")
ALTER TABLE "ExamSet" ADD COLUMN "ownerUserId" TEXT;
ALTER TABLE "ExamSet" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE "ExamSet" ADD COLUMN "primarySkill" TEXT;

CREATE INDEX "ExamSet_ownerUserId_source_idx" ON "ExamSet"("ownerUserId", "source");
CREATE INDEX "ExamSet_source_isPublished_idx" ON "ExamSet"("source", "isPublished");

ALTER TABLE "ExamSet" ADD CONSTRAINT "ExamSet_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
