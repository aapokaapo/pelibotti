const { Events } = require('discord.js');

const { startWeeklyScheduler } = require('../jobs/weeklyScheduler');

async function registerCommands(client) {
  const commandPayload = [...client.commands.values()].map((command) => command.data.toJSON());

  if (process.env.DISCORD_GUILD_ID) {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
    await guild.commands.set(commandPayload);
    return;
  }

  await client.application.commands.set(commandPayload);
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await registerCommands(client);
    startWeeklyScheduler(client);
    console.log(`Logged in as ${client.user.tag}`);
  }
};
