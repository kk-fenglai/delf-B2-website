const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

async function disconnect() {
  try { await prisma.$disconnect(); } catch { /* best-effort */ }
}

module.exports = prisma;
module.exports.disconnect = disconnect;
