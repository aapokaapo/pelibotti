const { prisma } = require('../lib/prisma');

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

async function importTeams(guildId, rows) {
  if (rows.length === 0) {
    throw new Error('No team rows found in the attachment.');
  }

  const operations = rows.map((row) => {
    const name = normalizeString(row.name);

    if (!name) {
      throw new Error('Each team row must contain a name field.');
    }

    const hasLogoUrl = typeof row.logoUrl === 'string';
    const logoUrl = hasLogoUrl ? normalizeString(row.logoUrl) || null : undefined;

    return prisma.team.upsert({
      where: {
        guildId_name: {
          guildId,
          name
        }
      },
      update: logoUrl === undefined ? {} : { logoUrl },
      create: {
        id: normalizeString(row.id) || undefined,
        guildId,
        name,
        logoUrl: logoUrl ?? null
      }
    });
  });

  await prisma.$transaction(operations);
  return operations.length;
}

async function importFixtures(guildId, rows) {
  if (rows.length === 0) {
    throw new Error('No fixture rows found in the attachment.');
  }

  const teams = await prisma.team.findMany({
    where: {
      guildId
    },
    select: { id: true, name: true }
  });
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const teamsByName = new Map(teams.map((team) => [team.name.toLowerCase(), team]));

  function resolveTeam(row, idKey, nameKey) {
    const id = normalizeString(row[idKey]);
    if (id && teamsById.has(id)) {
      return teamsById.get(id);
    }

    const name = normalizeString(row[nameKey]);
    if (name && teamsByName.has(name.toLowerCase())) {
      return teamsByName.get(name.toLowerCase());
    }

    throw new Error(`Unable to resolve ${nameKey} for fixture row: ${JSON.stringify(row)}`);
  }

  function canonicalizeFixtureTeams(teamA, teamB) {
    if (teamA.id === teamB.id) {
      throw new Error(`Fixture teams must be different: ${teamA.name}`);
    }

    return [teamA, teamB].sort((left, right) => left.id.localeCompare(right.id));
  }

  const operations = rows.map((row) => {
    const weekNumber = parseWeekNumber(row.weekNumber);
    const resolvedTeamA = resolveTeam(row, 'teamAId', 'teamAName');
    const resolvedTeamB = resolveTeam(row, 'teamBId', 'teamBName');
    const [teamA, teamB] = canonicalizeFixtureTeams(resolvedTeamA, resolvedTeamB);

    return prisma.fixture.upsert({
      where: {
        guildId_weekNumber_teamAId_teamBId: {
          guildId,
          weekNumber,
          teamAId: teamA.id,
          teamBId: teamB.id
        }
      },
      update: {},
      create: {
        id: normalizeString(row.id) || undefined,
        guildId,
        weekNumber,
        teamAId: teamA.id,
        teamBId: teamB.id
      }
    });
  });

  await prisma.$transaction(operations);
  return operations.length;
}

async function importMapPools(guildId, rows) {
  if (rows.length === 0) {
    throw new Error('No map rows found in the attachment.');
  }

  const operations = rows.map((row) => {
    const weekNumber = parseWeekNumber(row.weekNumber);
    const maps = parseStringArray(row.maps);

    if (maps.length === 0) {
      throw new Error(`Map pool for week ${weekNumber} must contain at least one map.`);
    }

    return prisma.mapPool.upsert({
      where: {
        guildId_weekNumber: {
          guildId,
          weekNumber
        }
      },
      update: { maps },
      create: {
        id: normalizeString(row.id) || undefined,
        guildId,
        weekNumber,
        maps
      }
    });
  });

  await prisma.$transaction(operations);
  return operations.length;
}

module.exports = {
  importFixtures,
  importMapPools,
  importTeams,
  parseStringArray
};
