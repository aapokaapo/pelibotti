const { Events, MessageFlags } = require('discord.js');

const { prisma } = require('../lib/prisma');
const { normalizeDbStringList } = require('../utils/dbLists');
const { buildScheduleEmbed, createAvailabilityRows, NOT_AVAILABLE_VALUE } = require('../utils/messageBuilders');
const { formatSchedule, resolveChannelSchedule } = require('../utils/schedule');

async function handleSetupTeamSelect(interaction) {
  const [, ownerUserId] = interaction.customId.split(':');

  if (interaction.user.id !== ownerUserId) {
    await interaction.reply({
      content: 'Only the user who opened this team picker can use it.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const teamId = interaction.values[0];

  const [team, channelRecord] = await Promise.all([
    prisma.team.findFirst({
      where: {
        id: teamId,
        guildId: interaction.guildId
      }
    }),
    prisma.channel.upsert({
      where: { id: interaction.channelId },
      update: {
        guildId: interaction.guildId,
        teamId
      },
      create: {
        id: interaction.channelId,
        guildId: interaction.guildId,
        teamId
      }
    })
  ]);

  if (!team) {
    throw new Error('Selected team no longer exists.');
  }

  await interaction.update({
    content: `Linked <#${channelRecord.id}> to **${team.name}**.`,
    components: []
  });
}

async function handleAvailabilityButton(interaction) {
  const [, fixtureId, selectedIndexValue] = interaction.customId.split(':');
  const selectedIndex = Number.parseInt(selectedIndexValue, 10);

  const { fixture, channelRecord, mapPool, availabilities } = await prisma.$transaction(async (tx) => {
    const fixture = await tx.fixture.findFirst({
      where: {
        id: fixtureId,
        guildId: interaction.guildId
      },
      include: {
        teamA: true,
        teamB: true
      }
    });

    if (!fixture) {
      throw new Error('Fixture no longer exists.');
    }

    const channelRecord = await tx.channel.findUnique({
      where: { id: interaction.channelId }
    });

    if (!channelRecord) {
      throw new Error('Channel has not been configured yet.');
    }

    const defaultDates = normalizeDbStringList(channelRecord.defaultDates);
    const options = [...defaultDates, NOT_AVAILABLE_VALUE];
    const selectedDate = options[selectedIndex];

    if (!selectedDate) {
      throw new Error('Selected availability option is invalid.');
    }

    await tx.availability.upsert({
      where: {
        matchId_userId_messageId: {
          matchId: fixture.id,
          userId: interaction.user.id,
          messageId: interaction.message.id
        }
      },
      update: {
        selectedDate
      },
      create: {
        matchId: fixture.id,
        messageId: interaction.message.id,
        userId: interaction.user.id,
        channelId: interaction.channelId,
        selectedDate
      }
    });

    const [mapPool, availabilities] = await Promise.all([
      tx.mapPool.findUnique({
        where: {
          guildId_weekNumber: {
            guildId: fixture.guildId,
            weekNumber: fixture.weekNumber
          }
        }
      }),
      tx.availability.findMany({
        where: {
          matchId: fixture.id,
          messageId: interaction.message.id
        },
        orderBy: {
          selectedDate: 'asc'
        }
      })
    ]);

    if (!mapPool) {
      throw new Error('Map pool no longer exists.');
    }

    return {
      fixture,
      channelRecord,
      mapPool,
      availabilities,
      defaultDates
    };
  });

  await interaction.update({
    embeds: [buildScheduleEmbed({
      fixture,
      mapPool,
      defaultDates,
      availabilities,
      scheduleLabel: (() => {
        const schedule = resolveChannelSchedule(channelRecord);
        return formatSchedule(schedule.dayOfWeek, schedule.hour, schedule.minute);
      })()
    })],
    components: createAvailabilityRows(fixture.id, defaultDates)
  });
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
          return;
        }

        await command.execute(interaction);
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('setup_team_select:')) {
        await handleSetupTeamSelect(interaction);
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith('availability:')) {
        await handleAvailabilityButton(interaction);
      }
    } catch (error) {
      console.error('Interaction handling failed:', error);

      const payload = {
        content: error.message || 'Something went wrong while processing that interaction.',
        flags: MessageFlags.Ephemeral
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => undefined);
      } else {
        await interaction.reply(payload).catch(() => undefined);
      }
    }
  }
};
