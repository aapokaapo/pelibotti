const provider = process.env.DATABASE_PROVIDER || 'postgresql';
const { PrismaClient } = provider === 'sqlite'
  ? require('../generated/sqlite-client')
  : require('../generated/postgresql-client');

const prisma = new PrismaClient();

module.exports = { prisma };
