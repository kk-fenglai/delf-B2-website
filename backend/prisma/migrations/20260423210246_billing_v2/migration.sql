-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Price" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "amountCents" INTEGER NOT NULL,
    "supportsAutoRenew" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Price_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalContractId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "nextChargeAt" DATETIME,
    "lastChargeAt" DATETIME,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "signedAt" DATETIME,
    "terminatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayContract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayContract_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "Price" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefundOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "externalRefundNo" TEXT,
    "operatorAdminId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RefundOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PaymentOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PaymentOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "priceId" TEXT,
    "contractId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "externalTradeNo" TEXT,
    "providerOrderNo" TEXT,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "codeUrl" TEXT,
    "redirectUrl" TEXT,
    "paidAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentOrder_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "Price" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PaymentOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "PayContract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PaymentOrder" ("amountCents", "codeUrl", "createdAt", "currency", "expiresAt", "externalTradeNo", "id", "months", "paidAt", "plan", "product", "provider", "providerOrderNo", "redirectUrl", "status", "updatedAt", "userId") SELECT "amountCents", "codeUrl", "createdAt", "currency", "expiresAt", "externalTradeNo", "id", "months", "paidAt", "plan", "product", "provider", "providerOrderNo", "redirectUrl", "status", "updatedAt", "userId" FROM "PaymentOrder";
DROP TABLE "PaymentOrder";
ALTER TABLE "new_PaymentOrder" RENAME TO "PaymentOrder";
CREATE INDEX "PaymentOrder_userId_createdAt_idx" ON "PaymentOrder"("userId", "createdAt");
CREATE INDEX "PaymentOrder_provider_status_createdAt_idx" ON "PaymentOrder"("provider", "status", "createdAt");
CREATE INDEX "PaymentOrder_providerOrderNo_idx" ON "PaymentOrder"("providerOrderNo");
CREATE INDEX "PaymentOrder_contractId_idx" ON "PaymentOrder"("contractId");
CREATE UNIQUE INDEX "PaymentOrder_provider_providerOrderNo_key" ON "PaymentOrder"("provider", "providerOrderNo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Price_code_key" ON "Price"("code");

-- CreateIndex
CREATE INDEX "Price_productId_active_idx" ON "Price"("productId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PayContract_externalContractId_key" ON "PayContract"("externalContractId");

-- CreateIndex
CREATE INDEX "PayContract_status_nextChargeAt_idx" ON "PayContract"("status", "nextChargeAt");

-- CreateIndex
CREATE INDEX "PayContract_userId_status_idx" ON "PayContract"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RefundOrder_externalRefundNo_key" ON "RefundOrder"("externalRefundNo");

-- CreateIndex
CREATE INDEX "RefundOrder_orderId_status_idx" ON "RefundOrder"("orderId", "status");
