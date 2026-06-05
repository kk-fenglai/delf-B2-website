-- AudioDocument table + Question.audioDocumentId column.
--
-- This captures the drift between earlier schema.prisma changes (which were
-- pushed to the dev Neon branch via `prisma db push`) and the migrations
-- folder. Without it, the listening (Compréhension de l'Oral) feature
-- cannot run on environments that only ever ran `prisma migrate deploy`.
--
-- Idempotent (IF NOT EXISTS) so it's safe to re-run / safe to `migrate deploy`
-- on a database where the columns/tables were already added by hand.

-- AlterTable: add audioDocumentId on Question
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "audioDocumentId" TEXT;

-- CreateTable: AudioDocument
CREATE TABLE IF NOT EXISTS "AudioDocument" (
    "id" TEXT NOT NULL,
    "examSetId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "audioUrl" TEXT,
    "maxPlays" INTEGER NOT NULL DEFAULT 2,
    "prepSeconds" INTEGER NOT NULL DEFAULT 60,
    "gapSeconds" INTEGER NOT NULL DEFAULT 180,
    "answerSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AudioDocument_examSetId_order_idx"
    ON "AudioDocument"("examSetId", "order");

CREATE INDEX IF NOT EXISTS "Question_audioDocumentId_idx"
    ON "Question"("audioDocumentId");

-- AddForeignKey: AudioDocument → ExamSet (cascade on examset delete)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'AudioDocument_examSetId_fkey'
          AND table_name = 'AudioDocument'
    ) THEN
        ALTER TABLE "AudioDocument"
            ADD CONSTRAINT "AudioDocument_examSetId_fkey"
            FOREIGN KEY ("examSetId") REFERENCES "ExamSet"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: Question.audioDocumentId → AudioDocument (set null on doc delete)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Question_audioDocumentId_fkey'
          AND table_name = 'Question'
    ) THEN
        ALTER TABLE "Question"
            ADD CONSTRAINT "Question_audioDocumentId_fkey"
            FOREIGN KEY ("audioDocumentId") REFERENCES "AudioDocument"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
