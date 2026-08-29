-- M2 (PRD 2026-08-29 IELTS 接入): score columns Int → Float. IELTS bands carry
-- half points (6.5); DELF keeps writing integers (aiGrader/oralGrader round at
-- the source), so int4 → float8 widening loses nothing and display of existing
-- rows is unchanged. Standalone migration by design — verify separately.
ALTER TABLE "ExamSession"
  ALTER COLUMN "totalScore" TYPE DOUBLE PRECISION,
  ALTER COLUMN "maxScore" TYPE DOUBLE PRECISION;

ALTER TABLE "UserAttempt" ALTER COLUMN "score" TYPE DOUBLE PRECISION;

ALTER TABLE "Essay" ALTER COLUMN "aiScore" TYPE DOUBLE PRECISION;

ALTER TABLE "Oral" ALTER COLUMN "aiScore" TYPE DOUBLE PRECISION;
