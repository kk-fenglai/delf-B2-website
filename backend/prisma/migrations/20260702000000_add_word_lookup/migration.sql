-- Cache table for AI dictionary lookups (reading assistant 划词查询).
CREATE TABLE "WordLookup" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'zh',
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordLookup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WordLookup_key_key" ON "WordLookup"("key");
