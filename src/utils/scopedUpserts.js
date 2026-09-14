const { getStoredChannelScopeId } = require('./channelScope');

function upsertFixtureByScope(db, { id, guildId, channelId, weekNumber, teamAId, teamBId }) {
  const storedChannelId = getStoredChannelScopeId(channelId);

  return db.fixture.upsert({
    where: {
      guildId_channelId_weekNumber_teamAId_teamBId: {
        guildId,
        channelId: storedChannelId,
        weekNumber,
        teamAId,
        teamBId
      }
    },
    update: {},
    create: {
      id,
      guildId,
      channelId: storedChannelId,
      weekNumber,
      teamAId,
      teamBId
    }
  });
}

function upsertMapPoolByScope(db, { id, guildId, channelId, weekNumber, maps }) {
  const storedChannelId = getStoredChannelScopeId(channelId);

  return db.mapPool.upsert({
    where: {
      guildId_channelId_weekNumber: {
        guildId,
        channelId: storedChannelId,
        weekNumber
      }
    },
    update: { maps },
    create: {
      id,
      guildId,
      channelId: storedChannelId,
      weekNumber,
      maps
    }
  });
}

module.exports = {
  upsertFixtureByScope,
  upsertMapPoolByScope
};
