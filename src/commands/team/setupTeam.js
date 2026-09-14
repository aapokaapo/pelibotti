const { MessageFlags, SlashCommandBuilder } = require('discord.js');

const { prisma } = require('../../lib/prisma');
const { createTeamSelectRows } = require('../../utils/messageBuilders');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_team')
    .setDescription('Link the current channel to a team from the database.'),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new Error('This command can only be used inside a server.');
    }

    const teams = await prisma.team.findMany({
      where: {
        guildId: interaction.guildId
      },
      orderBy: {
        name: 'asc'
      }
    });

    if (teams.length === 0) {
      await interaction.reply({
        content: 'No teams exist yet. Ask an administrator to run /upload_teams first.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (teams.length > 125) {
      await interaction.reply({
        content: 'This server has more than 125 teams configured. Narrow the team list before using /setup_team.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({
      content: 'Select the team to link with this channel:',
      components: createTeamSelectRows(teams, interaction.user.id),
      flags: MessageFlags.Ephemeral
    });
  }
};
