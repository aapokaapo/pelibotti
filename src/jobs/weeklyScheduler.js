const cron = require('node-cron');

const { prisma } = require('../lib/prisma');
const { getTimezone } = require('../utils/env');
const { buildScheduleEmbed, createAvailabilityRows } = require('../utils/messageBuilders');
const { formatSchedule, getZonedTimeParts, resolveChannelSchedule, resolveUpcomingWeekNumber } = require('../utils/schedule');

let isSchedulerRunning = false;

async function createScheduleForChannel(client, channelRecord, weekNumber = resolveUpcomingWeekNumber()) {
  if (!channelRecord.teamId) {
    throw new Error(`Channel ${channelRecord.id} is not linked to a team.`);
  }

  if (!Array.isArray(channelRecord.defaultDates) || channelRecord.defaultDates.length === 0) {
    throw new Error(`Channel ${channelRecord.id} has no default scheduling dates configured.`);
  }

  const fixture = await prisma.fixture.findFirst({
    where: {
      guildId: channelRecord.guildId,
      weekNumber,
      OR: [
        { teamAId: channelRecord.teamId },
        { teamBId: channelRecord.teamId }
      ]
    },
    include: {
      teamA: true,
      teamB: true
    },
    orderBy: [
      { teamAId: 'asc' },
      { teamBId: 'asc' }
    ]
  });

  if (!fixture) {
    throw new Error(`No fixture found for team ${channelRecord.teamId} in channel ${channelRecord.id} for week ${weekNumber}.`);
  }

  const mapPool = await prisma.mapPool.findUnique({
    where: {
      guildId_weekNumber: {
        guildId: channelRecord.guildId,
        weekNumber
      }
    }
  });

  if (!mapPool) {
    throw new Error(`No map pool found for guild ${channelRecord.guildId} in week ${weekNumber}.`);
  }

  const discordChannel = await client.channels.fetch(channelRecord.id);

  if (!discordChannel?.isTextBased()) {
    throw new Error(`Channel ${channelRecord.id} is not a text channel.`);
  }

  const schedule = resolveChannelSchedule(channelRecord);
  const scheduleLabel = formatSchedule(schedule.dayOfWeek, schedule.hour, schedule.minute);

  const message = await discordChannel.send({
    embeds: [buildScheduleEmbed({
      fixture,
      mapPool,
      defaultDates: channelRecord.defaultDates,
      availabilities: [],
      scheduleLabel
    })],
    components: createAvailabilityRows(fixture.id, channelRecord.defaultDates)
  });

  await prisma.channel.update({
    where: { id: channelRecord.id },
    data: { lastScheduledWeekNumber: weekNumber }
  });

  return {
    fixture,
    message
  };
}

async function runWeeklyScheduler(client, referenceDate = new Date()) {
  const timezone = getTimezone();
  const weekNumber = resolveUpcomingWeekNumber(referenceDate);
  const currentTime = getZonedTimeParts(timezone, referenceDate);

  const channels = await prisma.channel.findMany({
    where: {
      teamId: { not: null },
      defaultDates: { isEmpty: false },
      scheduleDayOfWeek: currentTime.dayOfWeek,
      scheduleHour: currentTime.hour,
      scheduleMinute: currentTime.minute,
      OR: [
        { lastScheduledWeekNumber: null },
        { lastScheduledWeekNumber: { not: weekNumber } }
      ]
    }
  });

  const concurrency = 5;

  for (let index = 0; index < channels.length; index += concurrency) {
    const batch = channels.slice(index, index + concurrency);
    const results = await Promise.allSettled(
      batch.map((channelRecord) => createScheduleForChannel(client, channelRecord, weekNumber))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Weekly scheduling failed:', result.reason);
      }
    }
  }
}

function startWeeklyScheduler(client) {
  cron.schedule('* * * * *', async () => {
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
