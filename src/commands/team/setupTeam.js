const { SlashCommandBuilder } = require('discord.js');

const { prisma } = require('../../lib/prisma');
const { createTeamSelectRows } = require('../../utils/messageBuilders');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_team')
    .setDescription('Link the current channel to a team from the database.'),
  async execute(interaction) {
    const teams = await prisma.team.findMany({
      orderBy: {
        name: 'asc'
      }
    });

    if (teams.length === 0) {
      await interaction.reply({
        content: 'No teams exist yet. Ask an administrator to run /upload_teams first.',
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: 'Select the team to link with this channel:',
      components: createTeamSelectRows(teams),
      ephemeral: true
    });
  }
};
