const { Events, MessageFlags } = require('discord.js');

const { prisma } = require('../lib/prisma');
const { normalizeDbStringList } = require('../utils/dbLists');
const {
  buildScheduleEmbed,
  createAvailabilityRows,
  formatSuggestionDateLabel,
  createSuggestionTimeModal,
  NOT_AVAILABLE_VALUE
} = require('../utils/messageBuilders');

function formatSuggestedTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseCustomSuggestion(value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(normalizedValue);

  if (!match) {
    throw new Error('Custom date must use YYYY-MM-DD HH:MM format.');
  }

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match;
  const year = Number.parseInt(yearValue, 10);
  const month = Number.parseInt(monthValue, 10);
  const day = Number.parseInt(dayValue, 10);
  const suggestedHour = Number.parseInt(hourValue, 10);
  const suggestedMinute = Number.parseInt(minuteValue, 10);
  const suggestedDate = `${yearValue}-${monthValue}-${dayValue}`;
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(parsedDate.getTime())
    || parsedDate.getUTCFullYear() !== year
    || parsedDate.getUTCMonth() !== month - 1
    || parsedDate.getUTCDate() !== day
  ) {
    throw new Error('Custom date must be a valid calendar date.');
  }

  if (suggestedHour < 0 || suggestedHour > 23 || suggestedMinute < 0 || suggestedMinute > 59) {
    throw new Error('Custom time must be a valid 24-hour HH:MM value.');
  }

  return {
    suggestedDate,
    suggestedHour,
    suggestedMinute
  };
}

async function loadScheduleState(tx, { fixtureId, guildId, channelId, messageId }) {
  const fixture = await tx.fixture.findFirst({
    where: {
      id: fixtureId,
      guildId
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
    where: { id: channelId }
  });

  if (!channelRecord) {
    throw new Error('Channel has not been configured yet.');
  }

  const defaultDates = normalizeDbStringList(channelRecord.defaultDates);

  const [channelMapPool, guildMapPool, availabilities, dateSuggestions] = await Promise.all([
    tx.mapPool.findUnique({
      where: {
        guildId_channelId_weekNumber: {
          guildId: fixture.guildId,
          channelId,
          weekNumber: fixture.weekNumber
        }
      }
    }),
    tx.mapPool.findFirst({
      where: {
        guildId: fixture.guildId,
        channelId: null,
        weekNumber: fixture.weekNumber
      }
    }),
    tx.availability.findMany({
      where: {
        matchId: fixture.id,
        messageId
      },
      orderBy: {
        selectedDate: 'asc'
      }
    }),
    tx.dateSuggestion.findMany({
      where: {
        fixtureId: fixture.id,
        messageId
      },
      orderBy: [
        { suggestedDate: 'asc' },
        { suggestedHour: 'asc' },
        { suggestedMinute: 'asc' },
        { createdAt: 'asc' }
      ]
    })
  ]);
  const mapPool = channelMapPool || guildMapPool;

  if (!mapPool) {
    throw new Error('Map pool no longer exists.');
  }

  return {
    fixture,
    channelRecord,
    mapPool,
    availabilities,
    dateSuggestions,
    defaultDates
  };
}

function buildScheduleMessage({ fixture, channelRecord, mapPool, availabilities, dateSuggestions, defaultDates }) {
  return {
    embeds: [buildScheduleEmbed({
      fixture,
      mapPool,
      defaultDates,
      availabilities,
      dateSuggestions,
      scheduleLabel: channelRecord.autoScheduleEnabled ? 'Enabled' : 'Manual only'
    })],
    components: createAvailabilityRows(fixture.id, defaultDates)
  };
}

function isScheduleMessageForFixture(message, fixtureId, clientUserId) {
  if (message.author?.id !== clientUserId) {
    return false;
  }

  return message.components.some((row) => row.components.some((component) => component.customId === `suggest_date:${fixtureId}`
    || component.customId?.startsWith(`availability:${fixtureId}:`)));
}

async function handleSetupTeamSelect(interaction) {
  const [, ownerUserId] = interaction.customId.split(':');

  if (interaction.user.id !== ownerUserId) {
    await interaction.reply({
      content: 'Only the user who opened this team picker can use it.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferUpdate();

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

  await interaction.editReply({
    content: `Linked <#${channelRecord.id}> to **${team.name}**.`,
    components: []
  });
}

async function handleAvailabilityButton(interaction) {
  const [, fixtureId, selectedIndexValue] = interaction.customId.split(':');
  const selectedIndex = Number.parseInt(selectedIndexValue, 10);

  await interaction.deferUpdate();

  const state = await prisma.$transaction(async (tx) => {
    const scheduleState = await loadScheduleState(tx, {
      fixtureId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: interaction.message.id
    });

    const { fixture, defaultDates } = scheduleState;
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

    return loadScheduleState(tx, {
      fixtureId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: interaction.message.id
    });
  });

  await interaction.editReply(buildScheduleMessage(state));
}

async function handleSuggestDateButton(interaction) {
  const [, fixtureId] = interaction.customId.split(':');

  const fixture = await prisma.fixture.findFirst({
    where: {
      id: fixtureId,
      guildId: interaction.guildId
    },
    select: { id: true }
  });

  if (!fixture) {
    throw new Error('Fixture no longer exists.');
  }

  await interaction.showModal(createSuggestionTimeModal(fixtureId, interaction.message.id));
}

async function handleSuggestDateModal(interaction) {
  const [, fixtureId, messageId] = interaction.customId.split(':');

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  const {
    suggestedDate,
    suggestedHour,
    suggestedMinute
  } = parseCustomSuggestion(interaction.fields.getTextInputValue('suggested_date_time'));

  const state = await prisma.$transaction(async (tx) => {
    const scheduleState = await loadScheduleState(tx, {
      fixtureId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId
    });

    await tx.dateSuggestion.upsert({
      where: {
        fixtureId_userId_messageId: {
          fixtureId: scheduleState.fixture.id,
          userId: interaction.user.id,
          messageId
        }
      },
      update: {
        channelId: interaction.channelId,
        suggestedDate,
        suggestedHour,
        suggestedMinute
      },
      create: {
        fixtureId: scheduleState.fixture.id,
        messageId,
        userId: interaction.user.id,
        channelId: interaction.channelId,
        suggestedDate,
        suggestedHour,
        suggestedMinute
      }
    });

    return {
      ...(await loadScheduleState(tx, {
        fixtureId,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        messageId
      })),
      scheduleMessageChannelId: interaction.channelId
    };
  });

  const channel = await interaction.client.channels.fetch(state.scheduleMessageChannelId);

  if (!channel?.isTextBased() || !channel.messages) {
    throw new Error('This interaction channel does not support message updates.');
  }

  const scheduleMessage = await channel.messages.fetch(messageId);

  if (!isScheduleMessageForFixture(scheduleMessage, fixtureId, interaction.client.user.id)) {
    throw new Error('The scheduling message could not be verified for this fixture.');
  }

  await scheduleMessage.edit(buildScheduleMessage(state));

  await interaction.editReply(`Suggested **${formatSuggestionDateLabel(suggestedDate)} ${formatSuggestedTime(suggestedHour, suggestedMinute)}**.`);
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
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith('suggest_date:')) {
        await handleSuggestDateButton(interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('suggest_date_modal:')) {
        await handleSuggestDateModal(interaction);
      }
    } catch (error) {
      console.error('Interaction handling failed:', error);

      const payload = {
        content: error.message || 'Something went wrong while processing that interaction.',
        flags: MessageFlags.Ephemeral
      };

      if (interaction.deferred) {
        if (interaction.isModalSubmit() || interaction.isChatInputCommand()) {
          await interaction.editReply({ content: payload.content }).catch(() => interaction.followUp(payload).catch(() => undefined));
        } else {
          await interaction.followUp(payload).catch(() => undefined);
        }
      } else if (interaction.replied) {
        await interaction.followUp(payload).catch(() => undefined);
      } else {
        await interaction.reply(payload).catch(() => undefined);
      }
    }
  }
};
