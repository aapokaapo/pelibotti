const { Events, MessageFlags } = require('discord.js');

const { prisma } = require('../lib/prisma');
const { buildScheduleEmbed, createAvailabilityRows, NOT_AVAILABLE_VALUE } = require('../utils/messageBuilders');

async function handleSetupTeamSelect(interaction) {
  const teamId = interaction.values[0];

  const [team, channelRecord] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
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

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    include: {
      teamA: true,
      teamB: true
    }
  });

  if (!fixture) {
    throw new Error('Fixture no longer exists.');
  }

  const channelRecord = await prisma.channel.findUnique({
    where: { id: interaction.channelId }
  });

  if (!channelRecord) {
    throw new Error('Channel has not been configured yet.');
  }

  const options = [...channelRecord.defaultDates, NOT_AVAILABLE_VALUE];
  const selectedDate = options[selectedIndex];

  if (!selectedDate) {
    throw new Error('Selected availability option is invalid.');
  }

  await prisma.availability.upsert({
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
    prisma.mapPool.findUnique({ where: { weekNumber: fixture.weekNumber } }),
    prisma.availability.findMany({
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

  await interaction.update({
    embeds: [buildScheduleEmbed({
      fixture,
      mapPool,
      defaultDates: channelRecord.defaultDates,
      availabilities
    })],
    components: createAvailabilityRows(fixture.id, channelRecord.defaultDates)
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
