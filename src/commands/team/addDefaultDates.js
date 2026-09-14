const { MessageFlags, SlashCommandBuilder } = require('discord.js');

const { prisma } = require('../../lib/prisma');
const { parseStringArray } = require('../../utils/importers');
const { normalizeDbStringList } = require('../../utils/dbLists');

const MAX_DEFAULT_DATES = 23;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add_default_dates')
    .setDescription('Add one or more scheduling date options without replacing existing ones.')
    .addStringOption((option) =>
      option
        .setName('dates')
        .setDescription('Date options to add, e.g. Tue 20:00, Thu 20:00')
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new Error('This command can only be used inside a server.');
    }

    const requestedDates = parseStringArray(interaction.options.getString('dates', true));

    if (requestedDates.length === 0) {
      await interaction.reply({
        content: 'Provide at least one scheduling date to add.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const channelRecord = await prisma.channel.findUnique({
      where: { id: interaction.channelId },
      select: { defaultDates: true }
    });
    const existingDates = normalizeDbStringList(channelRecord?.defaultDates);
    const existingSet = new Set(existingDates);
    const uniqueDatesToAdd = requestedDates.filter((date) => !existingSet.has(date));

    if (uniqueDatesToAdd.length === 0) {
      await interaction.reply({
        content: `All provided dates already exist. Current default dates: ${existingDates.join(', ') || 'none'}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (existingDates.length + uniqueDatesToAdd.length > MAX_DEFAULT_DATES) {
      const availableSlots = Math.max(0, MAX_DEFAULT_DATES - existingDates.length);
      await interaction.reply({
        content: `You can add up to ${availableSlots} more date option${availableSlots === 1 ? '' : 's'} in this channel.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const updatedDates = [...existingDates, ...uniqueDatesToAdd];

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
      content: `Added: ${uniqueDatesToAdd.join(', ')}\nCurrent default dates: ${updatedDates.join(', ')}`,
      flags: MessageFlags.Ephemeral
    });
  }
};
