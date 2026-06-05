-- CreateTable: user essay templates (phrase library + structure frameworks)
CREATE TABLE "EssayTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'phrase',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EssayTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EssayTemplate_userId_createdAt_idx" ON "EssayTemplate"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "EssayTemplate" ADD CONSTRAINT "EssayTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
