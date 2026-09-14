const { MessageFlags, SlashCommandBuilder } = require('discord.js');

const { prisma } = require('../../lib/prisma');
const {
  buildConfigEmbed,
  createConfigActionRow,
  createTeamSelectRows
} = require('../../utils/messageBuilders');
const { normalizeDbStringList } = require('../../utils/dbLists');

async function loadConfigState(guildId, channelId) {
  const [teams, channelRecord] = await Promise.all([
    prisma.team.findMany({
      where: { guildId },
      orderBy: { name: 'asc' }
    }),
    prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        team: true
      }
    })
  ]);

  return {
    teams,
    teamName: channelRecord?.team?.name || null,
    defaultDates: normalizeDbStringList(channelRecord?.defaultDates)
  };
}

function buildConfigMessage(state, userId) {
  return {
    embeds: [buildConfigEmbed({
      teamName: state.teamName,
      defaultDates: state.defaultDates
    })],
    components: [
      ...createTeamSelectRows(state.teams, userId, 'config_team_select'),
      createConfigActionRow(userId)
    ]
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the linked team and default scheduling dates for this channel.'),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new Error('This command can only be used inside a server.');
    }

    const state = await loadConfigState(interaction.guildId, interaction.channelId);

    if (state.teams.length === 0) {
      await interaction.reply({
        content: 'No teams exist yet. Ask an administrator to run /upload_teams first.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({
      ...buildConfigMessage(state, interaction.user.id),
      flags: MessageFlags.Ephemeral
    });
  }
};
