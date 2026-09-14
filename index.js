require('dotenv').config();

const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { validateEnv } = require('./src/utils/env');

let webServer;
let prisma;

async function main() {
  validateEnv();
  ({ prisma } = require('./src/lib/prisma'));
  const { registerEventHandlers } = require('./src/events');
  const { loadCommands } = require('./src/utils/loadCommands');
  const { startWebServer } = require('./src/web/server');
  webServer = await startWebServer();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.commands = new Collection(loadCommands().map((command) => [command.data.name, command]));

  registerEventHandlers(client);

  await client.login(process.env.DISCORD_TOKEN);
}

async function shutdown() {
  if (webServer) {
    await new Promise((resolve, reject) => {
      webServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    }).catch(() => undefined);
  }

  await prisma.$disconnect().catch(() => undefined);
}

main().catch(async (error) => {
  console.error('Failed to start bot:', error);
  await shutdown();
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await shutdown();
    process.exit(0);
  });
}
