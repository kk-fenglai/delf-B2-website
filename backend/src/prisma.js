// Ensure DATABASE_URL is read from .env + .env.local before instantiating
// PrismaClient. Scripts that import this file directly (e.g. seedCoDemo.js)
// would otherwise connect to whatever DATABASE_URL was preset in the shell
// — which on this repo defaults to production via the system .env.
require('./config/env');

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

async function disconnect() {
  try { await prisma.$disconnect(); } catch { /* best-effort */ }
}

module.exports = prisma;
module.exports.disconnect = disconnect;
