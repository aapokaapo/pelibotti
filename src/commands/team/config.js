const { MessageFlags, SlashCommandBuilder } = require('discord.js');

const { prisma } = require('../../lib/prisma');
const { buildConfigMessage, loadConfigState } = require('../../utils/configMessage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the linked team and default scheduling dates for this channel.'),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new Error('This command can only be used inside a server.');
    }

    const state = await loadConfigState(prisma, {
      guildId: interaction.guildId,
      channelId: interaction.channelId
    });

    await interaction.reply({
      ...buildConfigMessage(state, interaction.user.id),
      flags: MessageFlags.Ephemeral
    });
  }
};
