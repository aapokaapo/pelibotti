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

function createAvailabilityRows(fixtureId, defaultDates) {
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

  return chunk(buttons, 5).map((buttonChunk) => new ActionRowBuilder().addComponents(...buttonChunk));
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
          ? normalizedDates.map((date, index) => `${index + 1}. ${date}`).join('\n')
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

function createConfigDatesModal(action, ownerUserId, messageId) {
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
    .setCustomId(`config_dates_modal:${action}:${ownerUserId}:${messageId}`)
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
      return `**${label}**\n${value}`;
    })
    .join('\n\n');
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

function formatSuggestedTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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

  if (fixture.teamA.logoUrl) {
    embed.setThumbnail(fixture.teamA.logoUrl);
  } else if (fixture.teamB.logoUrl) {
    embed.setThumbnail(fixture.teamB.logoUrl);
  }

  return embed;
}

module.exports = {
  buildScheduleEmbed,
  buildConfigEmbed,
  createConfigActionRow,
  createConfigDatesModal,
  createAvailabilityRows,
  formatSuggestionDateLabel,
  createSuggestionTimeModal,
  createTeamSelectRows,
  MAX_DEFAULT_DATES
};
