-- CreateTable
CREATE TABLE IF NOT EXISTS "PriceStripeMapping" (
    "id" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PriceStripeMapping_pkey" PRIMARY KEY ("id")
);

-- Indexes / constraints
CREATE UNIQUE INDEX IF NOT EXISTS "PriceStripeMapping_stripePriceId_key" ON "PriceStripeMapping"("stripePriceId");
CREATE UNIQUE INDEX IF NOT EXISTS "PriceStripeMapping_priceId_currency_key" ON "PriceStripeMapping"("priceId", "currency");
CREATE INDEX IF NOT EXISTS "PriceStripeMapping_currency_idx" ON "PriceStripeMapping"("currency");

-- Foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PriceStripeMapping_priceId_fkey'
  ) THEN
    ALTER TABLE "PriceStripeMapping"
    ADD CONSTRAINT "PriceStripeMapping_priceId_fkey"
    FOREIGN KEY ("priceId") REFERENCES "Price"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

