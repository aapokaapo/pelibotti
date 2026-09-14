const { Events, MessageFlags } = require('discord.js');

const { prisma } = require('../lib/prisma');
const { normalizeDbStringList } = require('../utils/dbLists');
const {
  buildScheduleEmbed,
  createAvailabilityRows,
  createSuggestionTimeModal,
  NOT_AVAILABLE_VALUE
} = require('../utils/messageBuilders');
const { formatSchedule, resolveChannelSchedule } = require('../utils/schedule');

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
    tx.mapPool.findUnique({
      where: {
        guildId_channelId_weekNumber: {
          guildId: fixture.guildId,
          channelId: null,
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
        { suggestedLabel: 'asc' },
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

  const suggestedLabel = interaction.fields.getTextInputValue('suggested_date_time').trim();

  if (!suggestedLabel) {
    throw new Error('Provide a custom date or time suggestion.');
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
        channelId: interaction.channelId,
        suggestedLabel
      },
      create: {
        fixtureId: scheduleState.fixture.id,
        messageId,
        userId: interaction.user.id,
        channelId: interaction.channelId,
        suggestedLabel
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

  await interaction.editReply(`Suggested **${suggestedLabel}**.`);
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
