const { MessageFlags, SlashCommandBuilder } = require('discord.js');

const { prisma } = require('../../lib/prisma');
const { parseStringArray } = require('../../utils/importers');

function buildDateKey(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set_default_dates')
    .setDescription('Replace all preferred scheduling dates for the current channel.')
    .addStringOption((option) =>
      option
        .setName('dates')
        .setDescription('Comma-separated date options, e.g. Tue 20:00, Thu 20:00')
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new Error('This command can only be used inside a server.');
    }

    const parsedDates = parseStringArray(interaction.options.getString('dates', true));
    const defaultDates = [];
    const seenDateKeys = new Set();

    for (const date of parsedDates) {
      const key = buildDateKey(date);
      if (seenDateKeys.has(key)) {
        continue;
      }
      seenDateKeys.add(key);
      defaultDates.push(date);
    }

    if (defaultDates.length === 0) {
      await interaction.reply({
        content: 'Provide at least one scheduling date.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (defaultDates.length > 23) {
      await interaction.reply({
        content: 'You can store up to 23 default dates so the bot can add a Suggest date button.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await prisma.channel.upsert({
      where: { id: interaction.channelId },
      update: {
        guildId: interaction.guildId,
        defaultDates
      },
      create: {
        id: interaction.channelId,
        guildId: interaction.guildId,
        defaultDates
      }
    });

    await interaction.reply({
      content: `Saved default dates for this channel: ${defaultDates.join(', ')}`,
      flags: MessageFlags.Ephemeral
    });
  }
};
