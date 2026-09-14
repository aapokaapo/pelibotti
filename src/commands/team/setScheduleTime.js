const { MessageFlags, SlashCommandBuilder } = require('discord.js');

const { prisma } = require('../../lib/prisma');
const { formatSchedule, parseScheduleTime } = require('../../utils/schedule');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set_schedule_time')
    .setDescription('Set when this channel receives the automated weekly scheduling post.')
    .addIntegerOption((option) =>
      option
        .setName('weekday')
        .setDescription('Weekday for the automated post')
        .setRequired(true)
        .addChoices(
          { name: 'Sunday', value: 0 },
          { name: 'Monday', value: 1 },
          { name: 'Tuesday', value: 2 },
          { name: 'Wednesday', value: 3 },
          { name: 'Thursday', value: 4 },
          { name: 'Friday', value: 5 },
          { name: 'Saturday', value: 6 }
        )
    )
    .addStringOption((option) =>
      option
        .setName('time')
        .setDescription('24-hour time in HH:MM format, interpreted in BOT_TIMEZONE')
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new Error('This command can only be used inside a server.');
    }

    const weekday = interaction.options.getInteger('weekday', true);
    const { hour, minute } = parseScheduleTime(interaction.options.getString('time', true));

    await prisma.channel.upsert({
      where: { id: interaction.channelId },
      update: {
        guildId: interaction.guildId,
        scheduleDayOfWeek: weekday,
        scheduleHour: hour,
        scheduleMinute: minute
      },
      create: {
        id: interaction.channelId,
        guildId: interaction.guildId,
        scheduleDayOfWeek: weekday,
        scheduleHour: hour,
        scheduleMinute: minute
      }
    });

    await interaction.reply({
      content: `Saved automated post time for this channel: ${formatSchedule(weekday, hour, minute)}.`,
      flags: MessageFlags.Ephemeral
    });
  }
};
