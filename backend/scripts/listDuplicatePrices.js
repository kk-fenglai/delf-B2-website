require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT p.id, p.code, p."productId", p.months, p.currency, p.active,
      (SELECT COUNT(*)::int FROM "PaymentOrder" o WHERE o."priceId" = p.id) AS orders,
      (SELECT COUNT(*)::int FROM "PayContract" c WHERE c."priceId" = p.id) AS contracts
    FROM "Price" p
    WHERE (p."productId", p.months, UPPER(p.currency)) IN (
      SELECT "productId", months, UPPER(currency) FROM "Price"
      GROUP BY "productId", months, UPPER(currency) HAVING COUNT(*) > 1
    )
    ORDER BY p."productId", p.months, p.currency, p.code
  `;
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
