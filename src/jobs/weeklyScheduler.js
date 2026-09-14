const cron = require('node-cron');

const { prisma } = require('../lib/prisma');
const { GUILD_DEFAULT_CHANNEL_ID } = require('../utils/channelScope');
const { hasDbStringListEntries, normalizeDbStringList } = require('../utils/dbLists');
const { getAutoScheduleCron, getTimezone } = require('../utils/env');
const { buildScheduleEmbed, createAvailabilityRows } = require('../utils/messageBuilders');
const { getTimezoneReferenceDate, resolveUpcomingWeekNumber } = require('../utils/schedule');

let isSchedulerRunning = false;

async function findFixturesForChannel(channelRecord, weekNumber) {
  const baseWhere = {
    guildId: channelRecord.guildId,
    weekNumber,
    OR: [
      { teamAId: channelRecord.teamId },
      { teamBId: channelRecord.teamId }
    ]
  };

  const include = {
    teamA: true,
    teamB: true
  };
  const orderBy = [
    { teamAId: 'asc' },
    { teamBId: 'asc' }
  ];

  const channelFixtures = await prisma.fixture.findMany({
    where: {
      ...baseWhere,
      channelId: channelRecord.id
    },
    include,
    orderBy
  });

  if (channelFixtures.length > 0) {
    return channelFixtures;
  }

  return prisma.fixture.findMany({
    where: {
      ...baseWhere,
      OR: [
        { channelId: GUILD_DEFAULT_CHANNEL_ID },
        { channelId: null }
      ]
    },
    include,
    orderBy
  });
}

async function findMapPoolsForChannel(channelRecord, weekNumber) {
  const channelMapPool = await prisma.mapPool.findUnique({
    where: {
      guildId_channelId_weekNumber: {
        guildId: channelRecord.guildId,
        channelId: channelRecord.id,
        weekNumber
      }
    }
  });

  if (channelMapPool) {
    return [channelMapPool];
  }

  return prisma.mapPool.findMany({
    where: {
      guildId: channelRecord.guildId,
      OR: [
        { channelId: GUILD_DEFAULT_CHANNEL_ID },
        { channelId: null }
      ],
      weekNumber
    },
    orderBy: {
      channelId: 'asc'
    }
  });
}

async function hasExistingScheduleMessage(discordChannel, clientUserId, weekNumber, fixtureIds) {
  if (!discordChannel?.messages || fixtureIds.length === 0) {
    return false;
  }

  const messages = await discordChannel.messages.fetch({
    limit: 50
  });
  const scheduleTitle = `Week ${weekNumber} Scheduling`;

  return messages.some((message) => {
    if (message.author?.id !== clientUserId) {
      return false;
    }

    if (!message.embeds.some((embed) => embed.title === scheduleTitle)) {
      return false;
    }

    return message.components.some((row) => row.components.some((component) => fixtureIds.some((fixtureId) => (
      component.customId === `suggest_date:${fixtureId}`
      || component.customId?.startsWith(`availability:${fixtureId}:`)
      || component.customId?.startsWith(`suggested_availability:${fixtureId}:`)
    ))));
  });
}

async function createScheduleForChannel(
  client,
  channelRecord,
  { weekNumber = resolveUpcomingWeekNumber(), claimField = null } = {}
) {
  if (!channelRecord.teamId) {
    throw new Error(`Channel ${channelRecord.id} is not linked to a team.`);
  }

  const defaultDates = normalizeDbStringList(channelRecord.defaultDates);

  if (defaultDates.length === 0) {
    throw new Error(`Channel ${channelRecord.id} has no default scheduling dates configured.`);
  }

  const fixtures = await findFixturesForChannel(channelRecord, weekNumber);

  if (fixtures.length === 0) {
    throw new Error(`No fixture found for team ${channelRecord.teamId} in channel ${channelRecord.id} for week ${weekNumber}.`);
  }

  const mapPools = await findMapPoolsForChannel(channelRecord, weekNumber);

  if (mapPools.length === 0) {
    throw new Error(`No map pool found for guild ${channelRecord.guildId} in week ${weekNumber}.`);
  }

  const discordChannel = await client.channels.fetch(channelRecord.id);

  if (!discordChannel?.isTextBased()) {
    throw new Error(`Channel ${channelRecord.id} is not a text channel.`);
  }

  const previousScheduledWeekNumber = claimField ? channelRecord[claimField] ?? null : null;
  const fixtureIds = fixtures.map((fixture) => fixture.id);

  if (claimField && previousScheduledWeekNumber === weekNumber) {
    const hasScheduleMessage = await hasExistingScheduleMessage(discordChannel, client.user.id, weekNumber, fixtureIds);

    if (hasScheduleMessage) {
      return { skipped: true };
    }
  }

  if (claimField && previousScheduledWeekNumber !== weekNumber) {
    const claimResult = await prisma.channel.updateMany({
      where: {
        id: channelRecord.id,
        OR: [
          { [claimField]: null },
          { [claimField]: { not: weekNumber } }
        ]
      },
      data: {
        [claimField]: weekNumber
      }
    });

    if (claimResult.count === 0) {
      return { skipped: true };
    }
  }

  try {
    const primaryFixture = fixtures[0];
    const message = await discordChannel.send({
      embeds: [buildScheduleEmbed({
        fixtures,
        mapPools,
        defaultDates,
        availabilities: [],
        dateSuggestions: [],
        scheduleLabel: channelRecord.autoScheduleEnabled ? 'Enabled' : 'Manual only'
      })],
      components: createAvailabilityRows(primaryFixture.id, defaultDates)
    });

    return {
      fixture: primaryFixture,
      fixtures,
      message,
      skipped: false
    };
  } catch (error) {
    if (claimField) {
      await prisma.channel.update({
        where: { id: channelRecord.id },
        data: { [claimField]: previousScheduledWeekNumber }
      }).catch(() => undefined);
    }

    throw error;
  }
}

async function runWeeklyScheduler(client, referenceDate = new Date()) {
  const timezone = getTimezone();
  const weekNumber = resolveUpcomingWeekNumber(getTimezoneReferenceDate(timezone, referenceDate));

  const channels = await prisma.channel.findMany({
    where: {
      teamId: { not: null },
      autoScheduleEnabled: true
    }
  }).then((records) => records.filter((channelRecord) => hasDbStringListEntries(channelRecord.defaultDates)));

  const concurrency = 5;

  for (let index = 0; index < channels.length; index += concurrency) {
    const batch = channels.slice(index, index + concurrency);
    const results = await Promise.allSettled(
      batch.map((channelRecord) => createScheduleForChannel(client, channelRecord, {
        weekNumber,
        claimField: 'lastScheduledWeekNumber'
      }))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Weekly scheduling failed:', result.reason);
      }
    }
  }
}

function startWeeklyScheduler(client) {
  const cronExpression = getAutoScheduleCron();

  if (!cron.validate(cronExpression)) {
    throw new Error('AUTO_SCHEDULE_CRON must be a valid cron expression.');
  }

  cron.schedule(cronExpression, async () => {
    if (isSchedulerRunning) {
      return;
    }

    isSchedulerRunning = true;

    try {
      await runWeeklyScheduler(client);
    } finally {
      isSchedulerRunning = false;
    }
  }, {
    timezone: getTimezone()
  });
}

module.exports = {
  createScheduleForChannel,
  runWeeklyScheduler,
  startWeeklyScheduler
};
