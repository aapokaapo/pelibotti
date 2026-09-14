const { MessageFlags, SlashCommandBuilder } = require('discord.js');

const { prisma } = require('../../lib/prisma');
const { createScheduleForChannel } = require('../../jobs/weeklyScheduler');
const { hasDbStringListEntries } = require('../../utils/dbLists');
const { getTimezone } = require('../../utils/env');
const { getTimezoneReferenceDate, resolveUpcomingWeekNumber } = require('../../utils/schedule');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule_now')
    .setDescription('Send the weekly scheduling message to the current channel right now.'),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channelRecord = await prisma.channel.findUnique({
      where: { id: interaction.channelId }
    });

    if (!channelRecord?.teamId) {
      await interaction.editReply('This channel must be linked to a team with /setup_team first.');
      return;
    }

    if (!hasDbStringListEntries(channelRecord.defaultDates)) {
      await interaction.editReply('This channel must have default dates configured with /set_default_dates first.');
      return;
    }

    const weekNumber = resolveUpcomingWeekNumber(getTimezoneReferenceDate(getTimezone()));
    const { fixture } = await createScheduleForChannel(interaction.client, channelRecord, { weekNumber });

    await interaction.editReply(`Scheduled week ${weekNumber} for **${fixture.teamA.name} vs ${fixture.teamB.name}**.`);
  }
};
