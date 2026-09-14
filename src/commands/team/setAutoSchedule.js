const { MessageFlags, SlashCommandBuilder } = require('discord.js');

const { prisma } = require('../../lib/prisma');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set_auto_schedule')
    .setDescription('Enable or disable the weekly automated scheduling post for this channel.')
    .addBooleanOption((option) =>
      option
        .setName('enabled')
        .setDescription('Whether the bot should post the weekly schedule automatically')
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new Error('This command can only be used inside a server.');
    }

    const enabled = interaction.options.getBoolean('enabled', true);

    await prisma.channel.upsert({
      where: { id: interaction.channelId },
      update: {
        guildId: interaction.guildId,
        autoScheduleEnabled: enabled
      },
      create: {
        id: interaction.channelId,
        guildId: interaction.guildId,
        autoScheduleEnabled: enabled
      }
    });

    await interaction.reply({
      content: enabled
        ? 'Automatic weekly scheduling is now enabled for this channel.'
        : 'Automatic weekly scheduling is now disabled for this channel.',
      flags: MessageFlags.Ephemeral
    });
  }
};
