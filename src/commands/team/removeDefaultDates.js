const { MessageFlags, SlashCommandBuilder } = require('discord.js');

const { prisma } = require('../../lib/prisma');
const { parseStringArray } = require('../../utils/importers');
const { normalizeDbStringList } = require('../../utils/dbLists');

function buildDateKey(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove_default_dates')
    .setDescription('Remove one or more scheduling date options from this channel.')
    .addStringOption((option) =>
      option
        .setName('dates')
        .setDescription('Date options to remove, e.g. Tue 20:00, Thu 20:00')
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new Error('This command can only be used inside a server.');
    }

    const requestedDates = parseStringArray(interaction.options.getString('dates', true));

    if (requestedDates.length === 0) {
      await interaction.reply({
        content: 'Provide at least one scheduling date to remove.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const channelRecord = await prisma.channel.findUnique({
      where: { id: interaction.channelId },
      select: { defaultDates: true }
    });
    const existingDates = normalizeDbStringList(channelRecord?.defaultDates);

    if (existingDates.length === 0) {
      await interaction.reply({
        content: 'No default dates are currently configured for this channel.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const datesToRemove = new Set(requestedDates.map((date) => buildDateKey(date)));
    const updatedDates = existingDates.filter((date) => !datesToRemove.has(buildDateKey(date)));
    const removedDates = existingDates.filter((date) => datesToRemove.has(buildDateKey(date)));

    if (removedDates.length === 0) {
      await interaction.reply({
        content: `None of those dates were found. Current default dates: ${existingDates.join(', ')}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await prisma.channel.upsert({
      where: { id: interaction.channelId },
      update: {
        guildId: interaction.guildId,
        defaultDates: updatedDates
      },
      create: {
        id: interaction.channelId,
        guildId: interaction.guildId,
        defaultDates: updatedDates
      }
    });

    await interaction.reply({
      content: `Removed: ${removedDates.join(', ')}\nCurrent default dates: ${updatedDates.join(', ') || 'none'}`,
      flags: MessageFlags.Ephemeral
    });
  }
};
