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

const prisma = new Proxy({}, {
  get(target, property, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

module.exports = { prisma };
