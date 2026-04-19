/*
  Warnings:

  - Added the required column `updatedAt` to the `Essay` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Essay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sessionId" TEXT,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "model" TEXT,
    "locale" TEXT,
    "aiScore" INTEGER,
    "aiFeedback" TEXT,
    "rubric" TEXT,
    "corrections" TEXT,
    "strengths" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "tokensCached" INTEGER,
    "costUsd" REAL,
    "errorMessage" TEXT,
    "gradedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Essay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Essay" ("aiFeedback", "aiScore", "content", "createdAt", "id", "questionId", "userId", "wordCount") SELECT "aiFeedback", "aiScore", "content", "createdAt", "id", "questionId", "userId", "wordCount" FROM "Essay";
DROP TABLE "Essay";
ALTER TABLE "new_Essay" RENAME TO "Essay";
CREATE INDEX "Essay_userId_createdAt_idx" ON "Essay"("userId", "createdAt");
CREATE INDEX "Essay_status_createdAt_idx" ON "Essay"("status", "createdAt");
CREATE INDEX "Essay_sessionId_idx" ON "Essay"("sessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
