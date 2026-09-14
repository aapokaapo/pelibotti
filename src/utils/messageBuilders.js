const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { normalizeDbStringList } = require('./dbLists');
const { getTimezone } = require('./env');
const { getTimezoneReferenceDate } = require('./schedule');

const NOT_AVAILABLE_VALUE = 'Not Available';
const SUGGEST_DATE_BUTTON_LABEL = 'Suggest date';

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function createTeamSelectRows(teams, userId) {
  if (teams.length === 0) {
    return [];
  }

  if (teams.length > 125) {
    throw new Error('Setup menu supports up to 125 teams per guild interaction.');
  }

  return chunk(teams, 25).map((teamChunk, index) => new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`setup_team_select:${userId}:${index}`)
      .setPlaceholder('Select a team for this channel')
      .addOptions(teamChunk.map((team) => ({
        label: team.name,
        description: team.logoUrl ? 'Includes logo URL' : 'No logo URL configured',
        value: team.id
      })))
  ));
}

function createAvailabilityRows(fixtureId, defaultDates) {
  const buttonLabels = [...normalizeDbStringList(defaultDates), NOT_AVAILABLE_VALUE];

  if (buttonLabels.length > 24) {
    throw new Error('Scheduling supports up to 23 default dates so the Suggest date button always fits.');
  }

  const buttons = [
    ...buttonLabels.map((label, index) => new ButtonBuilder()
      .setCustomId(`availability:${fixtureId}:${index}`)
      .setLabel(label)
      .setStyle(label === NOT_AVAILABLE_VALUE ? ButtonStyle.Secondary : ButtonStyle.Primary)),
    new ButtonBuilder()
    .setCustomId(`suggest_date:${fixtureId}`)
    .setLabel(SUGGEST_DATE_BUTTON_LABEL)
    .setStyle(ButtonStyle.Success)
  ];

  return chunk(buttons, 5).map((buttonChunk) => new ActionRowBuilder().addComponents(...buttonChunk));
}

function formatAvailability(defaultDates, availabilities) {
  const normalizedDefaultDates = normalizeDbStringList(defaultDates);
  const grouped = new Map([...normalizedDefaultDates, NOT_AVAILABLE_VALUE].map((label) => [label, []]));

  for (const availability of availabilities) {
    if (!grouped.has(availability.selectedDate)) {
      grouped.set(availability.selectedDate, []);
    }

    grouped.get(availability.selectedDate).push(`<@${availability.userId}>`);
  }

  return [...grouped.entries()]
    .map(([label, users]) => {
      const value = users.length > 0 ? users.join(', ') : '_No responses yet_';
      return `**${label}**\n${value}`;
    })
    .join('\n\n');
}

function formatSuggestedTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function formatSuggestionDateLabel(value) {
  const timezone = getTimezone();
  const targetDate = new Date(`${value}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat('fi-FI', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  });
  const parts = formatter.formatToParts(targetDate);
  const weekday = (parts.find((part) => part.type === 'weekday')?.value || '').replace(/\.+$/, '');
  const day = parts.find((part) => part.type === 'day')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';

  return `${weekday} ${day}.${month}.`;
}

function getSuggestionDateOptions(referenceDate = new Date()) {
  const timezone = getTimezone();
  const today = getTimezoneReferenceDate(timezone, referenceDate);

  return Array.from({ length: 7 }, (_, index) => {
    const targetDate = addDays(today, index);
    const value = targetDate.toISOString().slice(0, 10);

    return {
      label: formatSuggestionDateLabel(value),
      value
    };
  });
}

function formatDateSuggestions(dateSuggestions) {
  if (dateSuggestions.length === 0) {
    return '_No suggestions yet_';
  }

  const grouped = new Map();

  for (const suggestion of dateSuggestions) {
    const key = `${suggestion.suggestedDate}|${suggestion.suggestedHour}|${suggestion.suggestedMinute}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        label: `${formatSuggestionDateLabel(suggestion.suggestedDate)} ${formatSuggestedTime(suggestion.suggestedHour, suggestion.suggestedMinute)}`,
        users: []
      });
    }

    grouped.get(key).users.push(`<@${suggestion.userId}>`);
  }

  return [...grouped.values()]
    .map(({ label, users }) => `**${label}**\n${users.join(', ')}`)
    .join('\n\n');
}

function createSuggestionTimeModal(fixtureId, messageId) {
  const dateOptions = getSuggestionDateOptions();

  return new ModalBuilder()
    .setCustomId(`suggest_date_modal:${fixtureId}:${messageId}`)
    .setTitle('Suggest a date')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Choose date')
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('suggested_date')
            .setPlaceholder('Choose date')
            .setRequired(true)
            .addOptions(dateOptions.map((option) => new StringSelectMenuOptionBuilder()
              .setLabel(option.label)
              .setValue(option.value)))
        ),
      new LabelBuilder()
        .setLabel('Hour (0-23)')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('hour')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(2)
            .setPlaceholder('20')
        ),
      new LabelBuilder()
        .setLabel('Minute (0-59)')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('minute')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(2)
            .setPlaceholder('00')
        )
    );
}

function buildScheduleEmbed({ fixture, mapPool, defaultDates, availabilities, dateSuggestions, scheduleLabel }) {
  const normalizedMaps = normalizeDbStringList(mapPool.maps);
  const embed = new EmbedBuilder()
    .setTitle(`Week ${fixture.weekNumber} Scheduling`)
    .setColor(0x5865f2)
    .addFields(
      {
        name: 'Matchup',
        value: `${fixture.teamA.name} vs ${fixture.teamB.name}`,
        inline: false
      },
      {
        name: 'Map Pool',
        value: normalizedMaps.length > 0
          ? normalizedMaps.map((map, index) => `${index + 1}. ${map}`).join('\n')
          : 'No maps configured.',
        inline: false
      },
      {
        name: 'Channel Schedule',
        value: scheduleLabel || 'Manual only',
        inline: false
      },
      {
        name: 'Availability',
        value: formatAvailability(defaultDates, availabilities),
        inline: false
      },
      {
        name: 'Suggested Dates',
        value: formatDateSuggestions(dateSuggestions),
        inline: false
      }
    );

  if (fixture.teamA.logoUrl) {
    embed.setThumbnail(fixture.teamA.logoUrl);
  } else if (fixture.teamB.logoUrl) {
    embed.setThumbnail(fixture.teamB.logoUrl);
  }

  return embed;
}

module.exports = {
  NOT_AVAILABLE_VALUE,
  buildScheduleEmbed,
  createAvailabilityRows,
  formatSuggestionDateLabel,
  getSuggestionDateOptions,
  createSuggestionTimeModal,
  createTeamSelectRows
};
