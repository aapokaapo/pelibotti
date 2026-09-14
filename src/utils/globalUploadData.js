const GLOBAL_UPLOAD_GUILD_ID = '__pelibotti_global_upload__';
const { GUILD_DEFAULT_CHANNEL_ID } = require('./channelScope');
const { upsertFixtureByScope, upsertMapPoolByScope } = require('./scopedUpserts');

function isGlobalUploadGuildId(guildId) {
  return guildId === GLOBAL_UPLOAD_GUILD_ID;
}

async function listConfiguredGuildIds(db) {
  const [channelGuildRows, teamGuildRows] = await Promise.all([
    db.channel.findMany({
      distinct: ['guildId'],
      select: { guildId: true }
    }),
    db.team.findMany({
      distinct: ['guildId'],
      select: { guildId: true }
    })
  ]);

  return [...new Set([
    ...channelGuildRows.map((row) => row.guildId),
    ...teamGuildRows.map((row) => row.guildId)
  ])].filter((guildId) => guildId && !isGlobalUploadGuildId(guildId));
}

async function hydrateGlobalUploadDataForGuild(db, guildId) {
  if (!guildId || isGlobalUploadGuildId(guildId)) {
    return;
  }

  const [globalTeams, globalFixtures, globalMapPools] = await Promise.all([
    db.team.findMany({
      where: { guildId: GLOBAL_UPLOAD_GUILD_ID },
      orderBy: { name: 'asc' }
    }),
    db.fixture.findMany({
      where: {
        guildId: GLOBAL_UPLOAD_GUILD_ID,
        OR: [
          { channelId: GUILD_DEFAULT_CHANNEL_ID },
          { channelId: null }
        ]
      },
      orderBy: [
        { weekNumber: 'asc' },
        { teamAId: 'asc' },
        { teamBId: 'asc' }
      ]
    }),
    db.mapPool.findMany({
      where: {
        guildId: GLOBAL_UPLOAD_GUILD_ID,
        OR: [
          { channelId: GUILD_DEFAULT_CHANNEL_ID },
          { channelId: null }
        ]
      },
      orderBy: { weekNumber: 'asc' }
    })
  ]);

  if (globalTeams.length === 0 && globalFixtures.length === 0 && globalMapPools.length === 0) {
    return;
  }

  const globalTeamIdToGuildTeamId = new Map();
  for (const globalTeam of globalTeams) {
    const guildTeam = await db.team.upsert({
      where: {
        guildId_name: {
          guildId,
          name: globalTeam.name
        }
      },
      update: {
        logoUrl: globalTeam.logoUrl
      },
      create: {
        guildId,
        name: globalTeam.name,
        logoUrl: globalTeam.logoUrl
      },
      select: {
        id: true
      }
    });
    globalTeamIdToGuildTeamId.set(globalTeam.id, guildTeam.id);
  }

  for (const globalFixture of globalFixtures) {
    const teamAId = globalTeamIdToGuildTeamId.get(globalFixture.teamAId);
    const teamBId = globalTeamIdToGuildTeamId.get(globalFixture.teamBId);

    if (!teamAId || !teamBId) {
      continue;
    }

    await upsertFixtureByScope(db, {
      guildId,
      channelId: null,
      weekNumber: globalFixture.weekNumber,
      teamAId,
      teamBId
    });
  }

  for (const globalMapPool of globalMapPools) {
    await upsertMapPoolByScope(db, {
      guildId,
      channelId: null,
      weekNumber: globalMapPool.weekNumber,
      maps: globalMapPool.maps
    });
  }
}

module.exports = {
  GLOBAL_UPLOAD_GUILD_ID,
  hydrateGlobalUploadDataForGuild,
  isGlobalUploadGuildId,
  listConfiguredGuildIds
};
