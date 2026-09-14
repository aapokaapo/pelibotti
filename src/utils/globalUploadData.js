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

  const guildDefaultScope = [
    { channelId: GUILD_DEFAULT_CHANNEL_ID },
    { channelId: null }
  ];
  const [
    globalTeams,
    globalFixtures,
    globalMapPools,
    guildTeamCount,
    guildFixtureCount,
    guildMapPoolCount
  ] = await Promise.all([
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
        OR: guildDefaultScope
      },
      orderBy: { weekNumber: 'asc' }
    }),
    db.team.count({
      where: { guildId }
    }),
    db.fixture.count({
      where: {
        guildId,
        OR: guildDefaultScope
      }
    }),
    db.mapPool.count({
      where: {
        guildId,
        OR: guildDefaultScope
      }
    })
  ]);

  if (globalTeams.length === 0 && globalFixtures.length === 0 && globalMapPools.length === 0) {
    return;
  }

  if (
    guildTeamCount >= globalTeams.length
    && guildFixtureCount >= globalFixtures.length
    && guildMapPoolCount >= globalMapPools.length
  ) {
    return;
  }

  const guildTeams = await Promise.all(globalTeams.map((globalTeam) => db.team.upsert({
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
  })));

  const globalTeamIdToGuildTeamId = new Map();
  globalTeams.forEach((globalTeam, index) => {
    globalTeamIdToGuildTeamId.set(globalTeam.id, guildTeams[index].id);
  });

  const fixtureUpserts = globalFixtures.flatMap((globalFixture) => {
    const teamAId = globalTeamIdToGuildTeamId.get(globalFixture.teamAId);
    const teamBId = globalTeamIdToGuildTeamId.get(globalFixture.teamBId);

    if (!teamAId || !teamBId) {
      return [];
    }

    return [upsertFixtureByScope(db, {
      guildId,
      channelId: null,
      weekNumber: globalFixture.weekNumber,
      teamAId,
      teamBId
    })];
  });
  const mapPoolUpserts = globalMapPools.map((globalMapPool) => upsertMapPoolByScope(db, {
    guildId,
    channelId: null,
    weekNumber: globalMapPool.weekNumber,
    maps: globalMapPool.maps
  }));

  await Promise.all([
    ...fixtureUpserts,
    ...mapPoolUpserts
  ]);
}

module.exports = {
  GLOBAL_UPLOAD_GUILD_ID,
  hydrateGlobalUploadDataForGuild,
  isGlobalUploadGuildId,
  listConfiguredGuildIds
};
