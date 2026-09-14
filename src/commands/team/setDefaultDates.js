const { SlashCommandBuilder } = require('discord.js');

const { prisma } = require('../../lib/prisma');
const { parseStringArray } = require('../../utils/importers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set_default_dates')
    .setDescription('Save the preferred scheduling dates for the current channel.')
    .addStringOption((option) =>
      option
        .setName('dates')
        .setDescription('Comma-separated date options, e.g. Tue 20:00, Thu 20:00')
        .setRequired(true)
    ),
  async execute(interaction) {
    const defaultDates = parseStringArray(interaction.options.getString('dates', true));

    if (defaultDates.length === 0) {
      await interaction.reply({
        content: 'Provide at least one scheduling date.',
        ephemeral: true
      });
      return;
    }

    if (defaultDates.length > 24) {
      await interaction.reply({
        content: 'You can store up to 24 default dates so the bot can add the Not Available button.',
        ephemeral: true
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
      ephemeral: true
    });
  }
};
