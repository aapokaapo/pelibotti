const { getDatabaseProvider } = require('../utils/env');

let prismaClient;

function getPrismaClient() {
  if (!prismaClient) {
    const { PrismaClient } = getDatabaseProvider() === 'sqlite'
      ? require('../generated/sqlite-client')
      : require('../generated/postgresql-client');

    prismaClient = new PrismaClient();
  }

  return prismaClient;
}

const prisma = {
  get team() {
    return getPrismaClient().team;
  },
  get channel() {
    return getPrismaClient().channel;
  },
  get fixture() {
    return getPrismaClient().fixture;
  },
  get mapPool() {
    return getPrismaClient().mapPool;
  },
  get availability() {
    return getPrismaClient().availability;
  },
  get dateSuggestion() {
    return getPrismaClient().dateSuggestion;
  },
  $connect(...args) {
    return getPrismaClient().$connect(...args);
  },
  $disconnect(...args) {
    return getPrismaClient().$disconnect(...args);
  },
  $transaction(...args) {
    return getPrismaClient().$transaction(...args);
  }
};

module.exports = { prisma };
