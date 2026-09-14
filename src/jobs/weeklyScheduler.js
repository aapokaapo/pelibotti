const cron = require('node-cron');

const { prisma } = require('../lib/prisma');
const { getTimezone } = require('../utils/env');
const { buildScheduleEmbed, createAvailabilityRows } = require('../utils/messageBuilders');
const { resolveUpcomingWeekNumber } = require('../utils/schedule');

async function createScheduleForChannel(client, channelRecord, weekNumber = resolveUpcomingWeekNumber()) {
  if (!channelRecord.teamId) {
    throw new Error(`Channel ${channelRecord.id} is not linked to a team.`);
  }

  if (!Array.isArray(channelRecord.defaultDates) || channelRecord.defaultDates.length === 0) {
    throw new Error(`Channel ${channelRecord.id} has no default scheduling dates configured.`);
  }

  const fixture = await prisma.fixture.findFirst({
    where: {
      weekNumber,
      OR: [
        { teamAId: channelRecord.teamId },
        { teamBId: channelRecord.teamId }
      ]
    },
    include: {
      teamA: true,
      teamB: true
    }
  });

  if (!fixture) {
    throw new Error(`No fixture found for team ${channelRecord.teamId} in channel ${channelRecord.id} for week ${weekNumber}.`);
  }

  const mapPool = await prisma.mapPool.findUnique({
    where: { weekNumber }
  });

  if (!mapPool) {
    throw new Error(`No map pool found for week ${weekNumber}.`);
  }

  const availabilities = await prisma.availability.findMany({
    where: {
      matchId: fixture.id,
      channelId: channelRecord.id
    },
    orderBy: {
      selectedDate: 'asc'
    }
  });

  const discordChannel = await client.channels.fetch(channelRecord.id);

  if (!discordChannel?.isTextBased()) {
    throw new Error(`Channel ${channelRecord.id} is not a text channel.`);
  }

  await discordChannel.send({
    embeds: [buildScheduleEmbed({
      fixture,
      mapPool,
      defaultDates: channelRecord.defaultDates,
      availabilities
    })],
    components: createAvailabilityRows(fixture.id, channelRecord.defaultDates)
  });

  return fixture;
}

async function runWeeklyScheduler(client) {
  const channels = await prisma.channel.findMany({
    where: {
      teamId: { not: null }
    }
  });

  const results = await Promise.allSettled(
    channels.map((channelRecord) => createScheduleForChannel(client, channelRecord))
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Weekly scheduling failed:', result.reason);
    }
  }
}

function startWeeklyScheduler(client) {
  cron.schedule('0 12 * * 0', async () => {
    await runWeeklyScheduler(client);
  }, {
    timezone: getTimezone()
  });
}

module.exports = {
  createScheduleForChannel,
  runWeeklyScheduler,
  startWeeklyScheduler
};
