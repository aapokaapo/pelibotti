async function upsertFixtureByScope(db, { id, guildId, channelId, weekNumber, teamAId, teamBId }) {
  if (channelId !== null) {
    return db.fixture.upsert({
      where: {
        guildId_channelId_weekNumber_teamAId_teamBId: {
          guildId,
          channelId,
          weekNumber,
          teamAId,
          teamBId
        }
      },
      update: {},
      create: {
        id,
        guildId,
        channelId,
        weekNumber,
        teamAId,
        teamBId
      }
    });
  }

  const existingFixture = await db.fixture.findFirst({
    where: {
      guildId,
      channelId: null,
      weekNumber,
      teamAId,
      teamBId
    },
    select: { id: true }
  });

  if (existingFixture) {
    return db.fixture.update({
      where: { id: existingFixture.id },
      data: {}
    });
  }

  return db.fixture.create({
    data: {
      id,
      guildId,
      channelId: null,
      weekNumber,
      teamAId,
      teamBId
    }
  });
}

async function upsertMapPoolByScope(db, { id, guildId, channelId, weekNumber, maps }) {
  if (channelId !== null) {
    return db.mapPool.upsert({
      where: {
        guildId_channelId_weekNumber: {
          guildId,
          channelId,
          weekNumber
        }
      },
      update: { maps },
      create: {
        id,
        guildId,
        channelId,
        weekNumber,
        maps
      }
    });
  }

  const existingMapPool = await db.mapPool.findFirst({
    where: {
      guildId,
      channelId: null,
      weekNumber
    },
    select: { id: true }
  });

  if (existingMapPool) {
    return db.mapPool.update({
      where: { id: existingMapPool.id },
      data: { maps }
    });
  }

  return db.mapPool.create({
    data: {
      id,
      guildId,
      channelId: null,
      weekNumber,
      maps
    }
  });
}

module.exports = {
  upsertFixtureByScope,
  upsertMapPoolByScope
};
