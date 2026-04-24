-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "externalTradeNo" TEXT,
    "providerOrderNo" TEXT,
    "codeUrl" TEXT,
    "redirectUrl" TEXT,
    "paidAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" DATETIME NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "contractId" TEXT,
    "nextChargeAt" DATETIME,
    "sourceOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PaymentOrder_userId_createdAt_idx" ON "PaymentOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentOrder_provider_status_createdAt_idx" ON "PaymentOrder"("provider", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentOrder_providerOrderNo_idx" ON "PaymentOrder"("providerOrderNo");

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- CreateIndex
CREATE INDEX "Subscription_autoRenew_nextChargeAt_idx" ON "Subscription"("autoRenew", "nextChargeAt");
