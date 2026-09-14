const { getDatabaseProvider } = require('../utils/env');

const { PrismaClient } = getDatabaseProvider() === 'sqlite'
  ? require('../generated/sqlite-client')
  : require('../generated/postgresql-client');

const prisma = new PrismaClient();

module.exports = { prisma };
