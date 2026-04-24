-- CreateTable
CREATE TABLE "ReadingPassage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "skill" TEXT NOT NULL DEFAULT 'CE',
    "title" TEXT,
    "content" TEXT NOT NULL,
    "sourceFile" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examSetId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "passage" TEXT,
    "passageId" TEXT,
    "audioUrl" TEXT,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Question_examSetId_fkey" FOREIGN KEY ("examSetId") REFERENCES "ExamSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Question_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "ReadingPassage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("audioUrl", "examSetId", "explanation", "id", "order", "passage", "points", "prompt", "skill", "type") SELECT "audioUrl", "examSetId", "explanation", "id", "order", "passage", "points", "prompt", "skill", "type" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
CREATE INDEX "Question_examSetId_skill_idx" ON "Question"("examSetId", "skill");
CREATE INDEX "Question_passageId_idx" ON "Question"("passageId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ReadingPassage_hash_key" ON "ReadingPassage"("hash");

-- CreateIndex
CREATE INDEX "ReadingPassage_skill_createdAt_idx" ON "ReadingPassage"("skill", "createdAt");
