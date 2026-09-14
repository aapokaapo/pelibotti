const cron = require('node-cron');

const { prisma } = require('../lib/prisma');
const { hasDbStringListEntries, normalizeDbStringList } = require('../utils/dbLists');
const { getAutoScheduleCron, getTimezone } = require('../utils/env');
const { buildScheduleEmbed, createAvailabilityRows } = require('../utils/messageBuilders');
const { getTimezoneReferenceDate, resolveUpcomingWeekNumber } = require('../utils/schedule');

let isSchedulerRunning = false;

async function findFixtureForChannel(channelRecord, weekNumber) {
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

  return prisma.fixture.findFirst({
    where: {
      ...baseWhere,
      channelId: channelRecord.id
    },
    include,
    orderBy
  }).then((fixture) => fixture || prisma.fixture.findFirst({
    where: {
      ...baseWhere,
      channelId: null
    },
    include,
    orderBy
  }));
}

async function findMapPoolForChannel(channelRecord, weekNumber) {
  const mapPool = await prisma.mapPool.findUnique({
    where: {
      guildId_channelId_weekNumber: {
        guildId: channelRecord.guildId,
        channelId: channelRecord.id,
        weekNumber
      }
    }
  });

  if (mapPool) {
    return mapPool;
  }

  return prisma.mapPool.findFirst({
    where: {
      guildId: channelRecord.guildId,
      channelId: null,
      weekNumber
    }
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

  const previousScheduledWeekNumber = claimField ? channelRecord[claimField] ?? null : null;

  if (claimField) {
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
    const fixture = await findFixtureForChannel(channelRecord, weekNumber);

    if (!fixture) {
      throw new Error(`No fixture found for team ${channelRecord.teamId} in channel ${channelRecord.id} for week ${weekNumber}.`);
    }

    const mapPool = await findMapPoolForChannel(channelRecord, weekNumber);

    if (!mapPool) {
      throw new Error(`No map pool found for guild ${channelRecord.guildId} in week ${weekNumber}.`);
    }

    const discordChannel = await client.channels.fetch(channelRecord.id);

    if (!discordChannel?.isTextBased()) {
      throw new Error(`Channel ${channelRecord.id} is not a text channel.`);
    }

    const message = await discordChannel.send({
      embeds: [buildScheduleEmbed({
        fixture,
        mapPool,
        defaultDates,
        availabilities: [],
        dateSuggestions: [],
        scheduleLabel: channelRecord.autoScheduleEnabled ? 'Enabled' : 'Manual only'
      })],
      components: createAvailabilityRows(fixture.id, defaultDates)
    });

    return {
      fixture,
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
      autoScheduleEnabled: true,
      OR: [
        { lastScheduledWeekNumber: null },
        { lastScheduledWeekNumber: { not: weekNumber } }
      ]
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
