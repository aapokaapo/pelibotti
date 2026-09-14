require('dotenv').config();

const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { registerEventHandlers } = require('./src/events');
const { loadCommands } = require('./src/utils/loadCommands');
const { prisma } = require('./src/lib/prisma');
const { validateEnv } = require('./src/utils/env');

async function main() {
  validateEnv();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.commands = new Collection(loadCommands().map((command) => [command.data.name, command]));

  registerEventHandlers(client);

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(async (error) => {
  console.error('Failed to start bot:', error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  });
}
