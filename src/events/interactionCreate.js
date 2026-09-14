const { Events, MessageFlags } = require('discord.js');

const { prisma } = require('../lib/prisma');
const { normalizeDbStringList } = require('../utils/dbLists');
const {
  buildScheduleEmbed,
  createAvailabilityRows,
  formatSuggestionDateLabel,
  getSuggestionDateOptions,
  createSuggestionTimeModal,
  NOT_AVAILABLE_VALUE
} = require('../utils/messageBuilders');
const { formatSchedule, resolveChannelSchedule } = require('../utils/schedule');

function formatSuggestedTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimePart(value, { min, max, label, required = true, defaultValue = null }) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  if (!normalizedValue) {
    if (!required) {
      return defaultValue;
    }

    throw new Error(`${label} is required.`);
  }

  if (!/^\d{1,2}$/.test(normalizedValue)) {
    throw new Error(`${label} must be a whole number.`);
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);

  if (parsedValue < min || parsedValue > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return parsedValue;
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

  const [mapPool, availabilities, dateSuggestions] = await Promise.all([
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
      scheduleLabel: (() => {
        const schedule = resolveChannelSchedule(channelRecord);
        return formatSchedule(schedule.dayOfWeek, schedule.hour, schedule.minute);
      })()
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

  const selectedDateValue = interaction.fields.getStringSelectValues('suggested_date')[0];
  const selectedDate = getSuggestionDateOptions().find((option) => option.value === selectedDateValue)?.value;
  const suggestedHour = parseTimePart(interaction.fields.getTextInputValue('hour'), {
    min: 0,
    max: 23,
    label: 'Hour'
  });
  const suggestedMinute = parseTimePart(interaction.fields.getTextInputValue('minute'), {
    min: 0,
    max: 59,
    label: 'Minute',
    required: false,
    defaultValue: 0
  });

  if (!selectedDate) {
    throw new Error('Selected suggestion date is invalid.');
  }

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
        suggestedDate: selectedDate,
        suggestedHour,
        suggestedMinute
      },
      create: {
        fixtureId: scheduleState.fixture.id,
        messageId,
        userId: interaction.user.id,
        channelId: interaction.channelId,
        suggestedDate: selectedDate,
        suggestedHour,
        suggestedMinute
      }
    });

    return loadScheduleState(tx, {
      fixtureId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId
    });
  });

  const channel = await interaction.client.channels.fetch(interaction.channelId);

  if (!channel?.isTextBased() || !channel.messages) {
    throw new Error('This interaction channel does not support message updates.');
  }

  const scheduleMessage = await channel.messages.fetch(messageId);

  if (!isScheduleMessageForFixture(scheduleMessage, fixtureId, interaction.client.user.id)) {
    throw new Error('The scheduling message could not be verified for this fixture.');
  }

  await scheduleMessage.edit(buildScheduleMessage(state));

  await interaction.editReply(`Suggested **${formatSuggestionDateLabel(selectedDate)} ${formatSuggestedTime(suggestedHour, suggestedMinute)}**.`);
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
