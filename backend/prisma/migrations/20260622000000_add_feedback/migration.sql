-- Feedback (意见箱) table.
--
-- Stores user-submitted feedback from the floating widget. Anonymous
-- submissions allowed (userId NULL); logged-in users auto-attach. Admin
-- triages via `status`. `adminNote` is reserved for future AI-客服 use.
--
-- Idempotent (IF NOT EXISTS) so `prisma migrate deploy` is safe to re-run.

-- CreateTable: Feedback
CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "pageUrl" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Feedback_status_createdAt_idx"
    ON "Feedback"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "Feedback_userId_idx"
    ON "Feedback"("userId");

-- AddForeignKey: Feedback.userId → User (set null on user delete)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Feedback_userId_fkey'
          AND table_name = 'Feedback'
    ) THEN
        ALTER TABLE "Feedback"
            ADD CONSTRAINT "Feedback_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
