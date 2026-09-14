const { prisma } = require('../lib/prisma');
const { GLOBAL_UPLOAD_GUILD_ID, listConfiguredGuildIds } = require('./globalUploadData');
const { upsertFixtureByScope, upsertMapPoolByScope } = require('./scopedUpserts');

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseWeekNumber(value) {
  const weekNumber = Number.parseInt(value, 10);

  if (!Number.isInteger(weekNumber) || weekNumber < 1) {
    throw new Error(`Invalid weekNumber: ${value}`);
  }

  return weekNumber;
}

function parseStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(/\s*[|;,]\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildScopedId(uploadedId, scopeId) {
  const normalizedUploadedId = normalizeString(uploadedId);
  if (!normalizedUploadedId) {
    return undefined;
  }

  return `${normalizedUploadedId}:${scopeId}`;
}

const MAX_TRANSACTION_OPERATIONS = 250;

async function flushOperationQueue(queueState) {
  if (queueState.operations.length > 0) {
    await prisma.$transaction(queueState.operations);
    queueState.operations = [];
    queueState.keys.clear();
  }
}

async function queueOperation(queueState, operationKey, operation) {
  if (queueState.keys.has(operationKey) || queueState.operations.length >= MAX_TRANSACTION_OPERATIONS) {
    await flushOperationQueue(queueState);
  }

  queueState.operations.push(operation);
  queueState.keys.add(operationKey);
}

async function importTeams(rows, { guildIds: inputGuildIds } = {}) {
  if (rows.length === 0) {
    throw new Error('No team rows found in the upload.');
  }

  let guildIds = Array.isArray(inputGuildIds) ? inputGuildIds.map((guildId) => normalizeString(guildId)).filter(Boolean) : [];

  if (guildIds.length === 0) {
    guildIds = await listConfiguredGuildIds(prisma);
  }

  if (guildIds.length === 0) {
    guildIds = [GLOBAL_UPLOAD_GUILD_ID];
  }

  const queueState = { operations: [], keys: new Set() };
  let operationCount = 0;
  for (const row of rows) {
    const name = normalizeString(row.name);

    if (!name) {
      throw new Error('Each team row must contain a name field.');
    }

    const hasLogoUrl = typeof row.logoUrl === 'string';
    const logoUrl = hasLogoUrl ? normalizeString(row.logoUrl) || null : undefined;
    const uploadedId = normalizeString(row.id);

    for (const guildId of guildIds) {
      await queueOperation(queueState, `${guildId}:${name}`, prisma.team.upsert({
        where: {
          guildId_name: {
            guildId,
            name
          }
        },
        update: logoUrl === undefined ? {} : { logoUrl },
        create: {
          id: uploadedId ? buildScopedId(uploadedId, guildId) : undefined,
          guildId,
          name,
          logoUrl: logoUrl ?? null
        }
      }));
      operationCount += 1;
    }
  }
  await flushOperationQueue(queueState);
  return operationCount;
}

async function importFixtures(rows) {
  if (rows.length === 0) {
    throw new Error('No fixture rows found in the upload.');
  }

  const channels = await prisma.channel.findMany({
    select: { id: true, guildId: true },
    orderBy: { id: 'asc' }
  });
  const configuredGuildIds = channels.length > 0
    ? [...new Set(channels.map((channel) => channel.guildId))]
    : await listConfiguredGuildIds(prisma);
  const guildIds = configuredGuildIds.length > 0 ? configuredGuildIds : [GLOBAL_UPLOAD_GUILD_ID];
  const channelsByGuildId = new Map();
  for (const guildId of guildIds) {
    channelsByGuildId.set(guildId, []);
  }
  for (const channel of channels) {
    channelsByGuildId.get(channel.guildId).push(channel);
  }

  const teams = await prisma.team.findMany({
    where: {
      guildId: {
        in: guildIds
      }
    },
    select: { id: true, name: true, guildId: true }
  });
  const teamsByGuildId = new Map();
  for (const team of teams) {
    if (!teamsByGuildId.has(team.guildId)) {
      teamsByGuildId.set(team.guildId, {
        byId: new Map(),
        byName: new Map()
      });
    }

    const guildTeams = teamsByGuildId.get(team.guildId);
    guildTeams.byId.set(team.id, team);
    guildTeams.byName.set(team.name.toLowerCase(), team);
  }

  function resolveTeam(row, idKey, nameKey, guildId) {
    const guildTeams = teamsByGuildId.get(guildId);
    if (!guildTeams) {
      throw new Error(`No teams found for guild ${guildId}. Import teams first.`);
    }

    const id = normalizeString(row[idKey]);
    if (id && guildTeams.byId.has(id)) {
      return guildTeams.byId.get(id);
    }
    const scopedId = buildScopedId(id, guildId);
    if (scopedId && guildTeams.byId.has(scopedId)) {
      return guildTeams.byId.get(scopedId);
    }

    const name = normalizeString(row[nameKey]);
    if (name && guildTeams.byName.has(name.toLowerCase())) {
      return guildTeams.byName.get(name.toLowerCase());
    }

    throw new Error(`Unable to resolve ${nameKey} for guild ${guildId} in fixture row: ${JSON.stringify(row)}`);
  }

  function canonicalizeFixtureTeams(teamA, teamB) {
    if (teamA.id === teamB.id) {
      throw new Error(`Fixture teams must be different: ${teamA.name}`);
    }

    return [teamA, teamB].sort((left, right) => left.id.localeCompare(right.id));
  }

  const queueState = { operations: [], keys: new Set() };
  let operationCount = 0;
  for (const row of rows) {
    const weekNumber = parseWeekNumber(row.weekNumber);
    const uploadedId = normalizeString(row.id);

    for (const [guildId, guildChannels] of channelsByGuildId.entries()) {
      const resolvedTeamA = resolveTeam(row, 'teamAId', 'teamAName', guildId);
      const resolvedTeamB = resolveTeam(row, 'teamBId', 'teamBName', guildId);
      const [teamA, teamB] = canonicalizeFixtureTeams(resolvedTeamA, resolvedTeamB);

      const targetChannels = guildChannels.length > 0 ? guildChannels : [{ id: null }];
      for (const channel of targetChannels) {
        const fixtureKey = `${guildId}:${channel.id || ''}:${weekNumber}:${teamA.id}:${teamB.id}`;
        if (channel.id === null) {
          await flushOperationQueue(queueState);
          await upsertFixtureByScope(prisma, {
            id: uploadedId ? buildScopedId(uploadedId, guildId) : undefined,
            guildId,
            channelId: null,
            weekNumber,
            teamAId: teamA.id,
            teamBId: teamB.id
          });
        } else {
          await queueOperation(queueState, fixtureKey, prisma.fixture.upsert({
            where: {
              guildId_channelId_weekNumber_teamAId_teamBId: {
                guildId,
                channelId: channel.id,
                weekNumber,
                teamAId: teamA.id,
                teamBId: teamB.id
              }
            },
            update: {},
            create: {
              id: uploadedId ? buildScopedId(uploadedId, channel.id) : undefined,
              guildId,
              channelId: channel.id,
              weekNumber,
              teamAId: teamA.id,
              teamBId: teamB.id
            }
          }));
        }
        operationCount += 1;
      }
    }
  }
  await flushOperationQueue(queueState);
  return operationCount;
}

async function importMapPools(rows) {
  if (rows.length === 0) {
    throw new Error('No map rows found in the upload.');
  }

  const channels = await prisma.channel.findMany({
    select: { id: true, guildId: true },
    orderBy: { id: 'asc' }
  });
  const configuredGuildIds = channels.length > 0
    ? [...new Set(channels.map((channel) => channel.guildId))]
    : await listConfiguredGuildIds(prisma);
  const guildIds = configuredGuildIds.length > 0 ? configuredGuildIds : [GLOBAL_UPLOAD_GUILD_ID];
  const targetChannels = channels.length > 0
    ? channels
    : guildIds.map((guildId) => ({ id: null, guildId }));

  const queueState = { operations: [], keys: new Set() };
  let operationCount = 0;
  for (const row of rows) {
    const weekNumber = parseWeekNumber(row.weekNumber);
    const maps = parseStringArray(row.maps);
    const uploadedId = normalizeString(row.id);

    if (maps.length === 0) {
      throw new Error(`Map pool for week ${weekNumber} must contain at least one map.`);
    }

    for (const channel of targetChannels) {
      const mapPoolKey = `${channel.guildId}:${channel.id || ''}:${weekNumber}`;
      if (channel.id === null) {
        await flushOperationQueue(queueState);
        await upsertMapPoolByScope(prisma, {
          id: uploadedId ? buildScopedId(uploadedId, channel.guildId) : undefined,
          guildId: channel.guildId,
          channelId: null,
          weekNumber,
          maps
        });
      } else {
        await queueOperation(queueState, mapPoolKey, prisma.mapPool.upsert({
          where: {
            guildId_channelId_weekNumber: {
              guildId: channel.guildId,
              channelId: channel.id,
              weekNumber
            }
          },
          update: { maps },
          create: {
            id: uploadedId ? buildScopedId(uploadedId, channel.id) : undefined,
            guildId: channel.guildId,
            channelId: channel.id,
            weekNumber,
            maps
          }
        }));
      }
      operationCount += 1;
    }
  }
  await flushOperationQueue(queueState);
  return operationCount;
}

module.exports = {
  importFixtures,
  importMapPools,
  importTeams,
  parseStringArray
};
