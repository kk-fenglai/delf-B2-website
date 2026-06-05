-- Oral / Production Orale module — adds OralFollowUp, Recording, Oral tables.

-- CreateTable: OralFollowUp
CREATE TABLE "OralFollowUp" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "audioUrl" TEXT,
    "expectedAngle" TEXT,

    CONSTRAINT "OralFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OralFollowUp_questionId_order_idx" ON "OralFollowUp"("questionId", "order");

ALTER TABLE "OralFollowUp"
  ADD CONSTRAINT "OralFollowUp_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Recording
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "questionId" TEXT NOT NULL,
    "followUpId" TEXT,
    "audioPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "transcript" TEXT,
    "transcriptModel" TEXT,
    "transcribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Recording_userId_createdAt_idx" ON "Recording"("userId", "createdAt");
CREATE INDEX "Recording_sessionId_questionId_idx" ON "Recording"("sessionId", "questionId");

ALTER TABLE "Recording"
  ADD CONSTRAINT "Recording_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Oral
CREATE TABLE "Oral" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "questionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "model" TEXT,
    "locale" TEXT,
    "aiScore" INTEGER,
    "aiFeedback" TEXT,
    "rubric" TEXT,
    "corrections" TEXT,
    "strengths" TEXT,
    "transcriptCombined" TEXT,
    "recordingIds" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "tokensCached" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Oral_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Oral_userId_createdAt_idx" ON "Oral"("userId", "createdAt");
CREATE INDEX "Oral_status_createdAt_idx" ON "Oral"("status", "createdAt");
CREATE INDEX "Oral_sessionId_idx" ON "Oral"("sessionId");

ALTER TABLE "Oral"
  ADD CONSTRAINT "Oral_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
