const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { normalizeDbStringList } = require('./dbLists');
const { getTimezone } = require('./env');

const SUGGEST_DATE_BUTTON_LABEL = 'Suggest Custom Date';
const MAX_DEFAULT_DATES = 23;

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function createTeamSelectRows(teams, userId, customIdPrefix = 'config_team_select') {
  if (teams.length === 0) {
    return [];
  }

  if (teams.length > 125) {
    throw new Error('Setup menu supports up to 125 teams per guild interaction.');
  }

  return chunk(teams, 25).map((teamChunk, index) => new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${customIdPrefix}:${userId}:${index}`)
      .setPlaceholder('Select a team for this channel')
      .addOptions(teamChunk.map((team) => ({
        label: team.name,
        description: team.logoUrl ? 'Includes logo URL' : 'No logo URL configured',
        value: team.id
      })))
  ));
}

function createAvailabilityRows(fixtureId, defaultDates, dateSuggestions = []) {
  const buttonLabels = normalizeDbStringList(defaultDates);

  if (buttonLabels.length > MAX_DEFAULT_DATES) {
    throw new Error('Scheduling supports up to 23 default dates so the Suggest date button always fits.');
  }

  const buttons = [
    ...buttonLabels.map((label, index) => new ButtonBuilder()
      .setCustomId(`availability:${fixtureId}:${index}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary)),
    new ButtonBuilder()
    .setCustomId(`suggest_date:${fixtureId}`)
    .setLabel(SUGGEST_DATE_BUTTON_LABEL)
    .setStyle(ButtonStyle.Success)
  ];

  const suggestedDateOptions = buildSuggestedDateOptions(dateSuggestions);
  const remainingSlots = Math.max(0, 25 - buttons.length);
  const suggestionButtons = suggestedDateOptions
    .slice(0, remainingSlots)
    .map((option, index) => new ButtonBuilder()
      .setCustomId(`suggested_availability:${fixtureId}:${index}`)
      .setLabel(option.label)
      .setStyle(ButtonStyle.Secondary));

  buttons.push(...suggestionButtons);

  return chunk(buttons, 5).map((buttonChunk) => new ActionRowBuilder().addComponents(...buttonChunk));
}

function buildSuggestedDateOptions(dateSuggestions) {
  const grouped = new Map();

  for (const suggestion of dateSuggestions) {
    const key = `${suggestion.suggestedDate}|${suggestion.suggestedHour}|${suggestion.suggestedMinute}`;

    if (!grouped.has(key)) {
      const label = `${formatSuggestionDateLabel(suggestion.suggestedDate)} ${formatSuggestedTime(suggestion.suggestedHour, suggestion.suggestedMinute)}`;
      grouped.set(key, {
        label,
        availabilityLabel: `Suggested: ${suggestion.suggestedDate} ${formatSuggestedTime(suggestion.suggestedHour, suggestion.suggestedMinute)}`
      });
    }
  }

  return [...grouped.values()];
}

function buildConfigEmbed({ teamName, defaultDates }) {
  const normalizedDates = normalizeDbStringList(defaultDates);

  return new EmbedBuilder()
    .setTitle('Channel Configuration')
    .setColor(0x5865f2)
    .addFields(
      {
        name: 'Linked Team',
        value: teamName ? `**${teamName}**` : '_No team linked_',
        inline: false
      },
      {
        name: 'Default Dates',
        value: normalizedDates.length > 0
          ? normalizedDates.map((date, index) => `${index + 1}. ${formatEmbedDateLabel(date)}`).join('\n')
          : '_No default dates configured_',
        inline: false
      },
      {
        name: 'Edit Dates',
        value: 'Use **Add Dates**, **Remove Dates**, or **Replace Dates** below.',
        inline: false
      }
    );
}

function createConfigActionRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`config_dates:add:${userId}`)
      .setLabel('Add Dates')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`config_dates:remove:${userId}`)
      .setLabel('Remove Dates')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`config_dates:replace:${userId}`)
      .setLabel('Replace Dates')
      .setStyle(ButtonStyle.Primary)
  );
}

function createConfigDatesModal(action, ownerUserId) {
  const actionMap = {
    add: {
      title: 'Add default dates',
      label: 'Dates to add'
    },
    remove: {
      title: 'Remove default dates',
      label: 'Dates to remove'
    },
    replace: {
      title: 'Replace default dates',
      label: 'New full default-date list'
    }
  };
  const selectedAction = actionMap[action];

  if (!selectedAction) {
    throw new Error('Unknown config date action.');
  }

  return new ModalBuilder()
    .setCustomId(`config_dates_modal:${action}:${ownerUserId}`)
    .setTitle(selectedAction.title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('config_dates_input')
          .setLabel(selectedAction.label)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Tue 20:00, Thu 20:00')
      )
    );
}

function formatAvailability(defaultDates, availabilities) {
  const normalizedDefaultDates = normalizeDbStringList(defaultDates);
  const grouped = new Map(normalizedDefaultDates.map((label) => [label, []]));

  for (const availability of availabilities) {
    if (!grouped.has(availability.selectedDate)) {
      grouped.set(availability.selectedDate, []);
    }

    grouped.get(availability.selectedDate).push(`<@${availability.userId}>`);
  }

  return [...grouped.entries()]
    .map(([label, users]) => {
      const value = users.length > 0 ? users.join(', ') : '_No responses yet_';
      return `**${formatEmbedDateLabel(label)}**\n${value}`;
    })
    .join('\n\n');
}

function formatDateList(values) {
  const normalizedValues = normalizeDbStringList(values);

  if (normalizedValues.length === 0) {
    return 'none';
  }

  return normalizedValues.map((value) => formatEmbedDateLabel(value)).join(', ');
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
        label: formatEmbedDateLabel(`${suggestion.suggestedDate} ${formatSuggestedTime(suggestion.suggestedHour, suggestion.suggestedMinute)}`),
        users: []
      });
    }

    grouped.get(key).users.push(`<@${suggestion.userId}>`);
  }

  return [...grouped.values()]
    .map(({ label, users }) => `**${formatEmbedDateLabel(label)}**\n${users.join(', ')}`)
    .join('\n\n');
}

function formatSuggestedTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatEmbedDateLabel(value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  const suggestedPrefix = 'Suggested: ';
  const match = /^(?<date>\d{4}-\d{2}-\d{2})[ T](?<hour>\d{2}):(?<minute>\d{2})$/.exec(
    normalizedValue.startsWith(suggestedPrefix)
      ? normalizedValue.slice(suggestedPrefix.length)
      : normalizedValue
  );

  if (!match?.groups) {
    return normalizedValue;
  }

  const timestamp = Math.floor(Date.UTC(
    Number.parseInt(match.groups.date.slice(0, 4), 10),
    Number.parseInt(match.groups.date.slice(5, 7), 10) - 1,
    Number.parseInt(match.groups.date.slice(8, 10), 10),
    Number.parseInt(match.groups.hour, 10),
    Number.parseInt(match.groups.minute, 10)
  ) / 1000);
  const formattedTimestamp = `<t:${timestamp}:F>`;

  return normalizedValue.startsWith(suggestedPrefix)
    ? `${suggestedPrefix}${formattedTimestamp}`
    : formattedTimestamp;
}

function formatSuggestionDateLabel(value) {
  const timezone = getTimezone();
  const targetDate = new Date(`${value}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat('en-GB', {
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

function createSuggestionTimeModal(fixtureId, messageId) {
  return new ModalBuilder()
    .setCustomId(`suggest_date_modal:${fixtureId}:${messageId}`)
    .setTitle('Suggest custom date')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('suggested_date_time')
          .setLabel('Custom date/time')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(16)
          .setPlaceholder('2026-01-15 20:00')
      )
    );
}

function buildScheduleEmbed({
  fixture,
  mapPool,
  fixtures: fixtureList,
  mapPools: mapPoolList,
  defaultDates,
  availabilities,
  dateSuggestions,
  scheduleLabel
}) {
  const fixtures = Array.isArray(fixtureList)
    ? fixtureList
    : [fixture].filter(Boolean);
  const mapPools = Array.isArray(mapPoolList)
    ? mapPoolList
    : [mapPool].filter(Boolean);
  const primaryFixture = fixtures[0];
  const embed = new EmbedBuilder()
    .setTitle(`Week ${primaryFixture.weekNumber} Scheduling`)
    .setColor(0x5865f2)
    .addFields(
      {
        name: fixtures.length === 1 ? 'Matchup' : 'Matchups',
        value: fixtures
          .map((listedFixture, index) => `${index + 1}. ${listedFixture.teamA.name} vs ${listedFixture.teamB.name}`)
          .join('\n'),
        inline: false
      },
      {
        name: mapPools.length === 1 ? 'Map Pool' : 'Map Pools',
        value: mapPools.length > 0
          ? mapPools.map((listedPool, poolIndex) => {
            const normalizedMaps = normalizeDbStringList(listedPool.maps);
            const mapsValue = normalizedMaps.length > 0
              ? normalizedMaps.map((map, mapIndex) => `${mapIndex + 1}. ${map}`).join('\n')
              : 'No maps configured.';
            return mapPools.length === 1 ? mapsValue : `**Pool ${poolIndex + 1}**\n${mapsValue}`;
          }).join('\n\n')
          : 'No maps configured.',
        inline: false
      },
      {
        name: 'Automation',
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

  if (primaryFixture.teamA.logoUrl) {
    embed.setThumbnail(primaryFixture.teamA.logoUrl);
  } else if (primaryFixture.teamB.logoUrl) {
    embed.setThumbnail(primaryFixture.teamB.logoUrl);
  }

  return embed;
}

module.exports = {
  buildScheduleEmbed,
  buildSuggestedDateOptions,
  buildConfigEmbed,
  createConfigActionRow,
  createConfigDatesModal,
  createAvailabilityRows,
  formatDateList,
  formatSuggestionDateLabel,
  createSuggestionTimeModal,
  createTeamSelectRows,
  MAX_DEFAULT_DATES
};
