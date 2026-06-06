-- Normalize currency, merge duplicate slots onto canonical codes, enforce uniqueness.

UPDATE "Price" SET currency = UPPER(currency) WHERE currency <> UPPER(currency);

-- Point historical orders at the canonical row (code without _USD/_CNY/_EUR suffix).
UPDATE "PaymentOrder" o
SET "priceId" = canon.id
FROM "Price" dup
INNER JOIN "Price" canon
  ON canon."productId" = dup."productId"
 AND canon.months = dup.months
 AND UPPER(canon.currency) = UPPER(dup.currency)
 AND canon.id <> dup.id
 AND canon.code !~ '_(USD|CNY|EUR)$'
WHERE o."priceId" = dup.id
  AND dup.code ~ '_(USD|CNY|EUR)$';

UPDATE "PayContract" c
SET "priceId" = canon.id
FROM "Price" dup
INNER JOIN "Price" canon
  ON canon."productId" = dup."productId"
 AND canon.months = dup.months
 AND UPPER(canon.currency) = UPPER(dup.currency)
 AND canon.id <> dup.id
 AND canon.code !~ '_(USD|CNY|EUR)$'
WHERE c."priceId" = dup.id
  AND dup.code ~ '_(USD|CNY|EUR)$';

-- Remove reference-currency duplicate rows when a canonical sibling exists.
DELETE FROM "Price" p
WHERE p.code ~ '_(USD|CNY|EUR)$'
AND EXISTS (
  SELECT 1 FROM "Price" canon
  WHERE canon."productId" = p."productId"
    AND canon.months = p.months
    AND UPPER(canon.currency) = UPPER(p.currency)
    AND canon.id <> p.id
    AND canon.code !~ '_(USD|CNY|EUR)$'
);

-- Drop any other unreferenced duplicates (keep earliest / canonical code).
DELETE FROM "Price" p
WHERE p.id IN (
  SELECT d.id FROM (
    SELECT
      pr.id,
      ROW_NUMBER() OVER (
        PARTITION BY pr."productId", pr.months, UPPER(pr.currency)
        ORDER BY
          CASE WHEN pr.code ~ '_(USD|CNY|EUR)$' THEN 1 ELSE 0 END,
          pr."createdAt" ASC
      ) AS rn
    FROM "Price" pr
  ) d
  WHERE d.rn > 1
  AND NOT EXISTS (SELECT 1 FROM "PaymentOrder" o WHERE o."priceId" = d.id)
  AND NOT EXISTS (SELECT 1 FROM "PayContract" c WHERE c."priceId" = d.id)
);

CREATE UNIQUE INDEX "Price_productId_months_currency_key" ON "Price"("productId", "months", "currency");
