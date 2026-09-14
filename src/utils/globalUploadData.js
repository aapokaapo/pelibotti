const { prisma } = require('../lib/prisma');
const GLOBAL_UPLOAD_GUILD_ID = '__pelibotti_global_upload__';
const { GUILD_DEFAULT_CHANNEL_ID, getStoredChannelScopeId } = require('./channelScope');
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

  const runHydration = async (tx) => {
    const guildDefaultScope = [
      { channelId: GUILD_DEFAULT_CHANNEL_ID },
      { channelId: null }
    ];
    const [globalTeams, globalFixtures, globalMapPools] = await Promise.all([
      tx.team.findMany({
        where: { guildId: GLOBAL_UPLOAD_GUILD_ID },
        orderBy: { name: 'asc' }
      }),
      tx.fixture.findMany({
        where: {
          guildId: GLOBAL_UPLOAD_GUILD_ID,
          OR: guildDefaultScope
        },
        orderBy: [
          { weekNumber: 'asc' },
          { teamAId: 'asc' },
          { teamBId: 'asc' }
        ]
      }),
      tx.mapPool.findMany({
        where: {
          guildId: GLOBAL_UPLOAD_GUILD_ID,
          OR: guildDefaultScope
        },
        orderBy: { weekNumber: 'asc' }
      })
    ]);

    if (globalTeams.length === 0 && globalFixtures.length === 0 && globalMapPools.length === 0) {
      return;
    }

    const existingGuildTeams = globalTeams.length === 0
      ? []
      : await tx.team.findMany({
        where: {
          guildId,
          name: {
            in: globalTeams.map((globalTeam) => globalTeam.name)
          }
        },
        select: {
          id: true,
          name: true,
          logoUrl: true
        }
      });
    const existingGuildTeamsByName = new Map(existingGuildTeams.map((team) => [team.name, team]));
    const teamUpserts = await Promise.all(globalTeams
      .filter((globalTeam) => {
        const existingGuildTeam = existingGuildTeamsByName.get(globalTeam.name);
        return !existingGuildTeam || existingGuildTeam.logoUrl !== globalTeam.logoUrl;
      })
      .map((globalTeam) => tx.team.upsert({
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
          id: true,
          name: true
        }
      })));
    const teamUpsertsByName = new Map(teamUpserts.map((team) => [team.name, team]));

    const globalTeamIdToGuildTeamId = new Map();
    globalTeams.forEach((globalTeam) => {
      const guildTeam = teamUpsertsByName.get(globalTeam.name) || existingGuildTeamsByName.get(globalTeam.name);
      if (guildTeam) {
        globalTeamIdToGuildTeamId.set(globalTeam.id, guildTeam.id);
      }
    });

    const fixtureInputs = globalFixtures.flatMap((globalFixture) => {
      const teamAId = globalTeamIdToGuildTeamId.get(globalFixture.teamAId);
      const teamBId = globalTeamIdToGuildTeamId.get(globalFixture.teamBId);

      if (!teamAId || !teamBId) {
        return [];
      }

      return [{
        guildId,
        channelId: globalFixture.channelId,
        weekNumber: globalFixture.weekNumber,
        teamAId,
        teamBId
      }];
    });
    const existingFixtures = fixtureInputs.length === 0
      ? []
      : await tx.fixture.findMany({
        where: {
          guildId,
          OR: fixtureInputs.map((fixtureInput) => ({
            channelId: getStoredChannelScopeId(fixtureInput.channelId),
            weekNumber: fixtureInput.weekNumber,
            teamAId: fixtureInput.teamAId,
            teamBId: fixtureInput.teamBId
          }))
        },
        select: {
          channelId: true,
          weekNumber: true,
          teamAId: true,
          teamBId: true
        }
      });
    const existingFixtureKeys = new Set(existingFixtures.map((fixture) => [
      getStoredChannelScopeId(fixture.channelId),
      fixture.weekNumber,
      fixture.teamAId,
      fixture.teamBId
    ].join(':')));
    const fixtureUpserts = fixtureInputs
      .filter((fixtureInput) => !existingFixtureKeys.has([
        getStoredChannelScopeId(fixtureInput.channelId),
        fixtureInput.weekNumber,
        fixtureInput.teamAId,
        fixtureInput.teamBId
      ].join(':')))
      .map((fixtureInput) => upsertFixtureByScope(tx, fixtureInput));

    const mapPoolInputs = globalMapPools.map((globalMapPool) => ({
      guildId,
      channelId: globalMapPool.channelId,
      weekNumber: globalMapPool.weekNumber,
      maps: globalMapPool.maps
    }));
    const existingMapPools = mapPoolInputs.length === 0
      ? []
      : await tx.mapPool.findMany({
        where: {
          guildId,
          OR: mapPoolInputs.map((mapPoolInput) => ({
            channelId: getStoredChannelScopeId(mapPoolInput.channelId),
            weekNumber: mapPoolInput.weekNumber
          }))
        },
        select: {
          channelId: true,
          weekNumber: true,
          maps: true
        }
      });
    const existingMapPoolsByKey = new Map(existingMapPools.map((mapPool) => ([
      [getStoredChannelScopeId(mapPool.channelId), mapPool.weekNumber].join(':'),
      JSON.stringify(mapPool.maps)
    ])));
    const mapPoolUpserts = mapPoolInputs
      .filter((mapPoolInput) => existingMapPoolsByKey.get([
        getStoredChannelScopeId(mapPoolInput.channelId),
        mapPoolInput.weekNumber
      ].join(':')) !== JSON.stringify(mapPoolInput.maps))
      .map((mapPoolInput) => upsertMapPoolByScope(tx, mapPoolInput));

    await Promise.all([
      ...fixtureUpserts,
      ...mapPoolUpserts
    ]);
  };

  if (db === prisma) {
    await db.$transaction((tx) => runHydration(tx));
    return;
  }

  await runHydration(db);
}

module.exports = {
  GLOBAL_UPLOAD_GUILD_ID,
  hydrateGlobalUploadDataForGuild,
  isGlobalUploadGuildId,
  listConfiguredGuildIds
};
