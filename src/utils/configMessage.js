const { normalizeDbStringList } = require('./dbLists');
const { hydrateGlobalUploadDataForGuild } = require('./globalUploadData');
const {
  buildConfigEmbed,
  createConfigActionRow,
  createTeamSelectRows
} = require('./messageBuilders');

async function loadConfigState(db, { guildId, channelId }) {
  await hydrateGlobalUploadDataForGuild(db, guildId);

  const [teams, channelRecord] = await Promise.all([
    db.team.findMany({
      where: { guildId },
      orderBy: { name: 'asc' }
    }),
    db.channel.findUnique({
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
  buildConfigMessage,
  loadConfigState
};
