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
  const rows = chunk(buttonLabels, 5).map((labelChunk, rowIndex) => new ActionRowBuilder().addComponents(
    ...labelChunk.map((label, buttonIndex) => {
      const absoluteIndex = rowIndex * 5 + buttonIndex;
      return new ButtonBuilder()
        .setCustomId(`availability:${fixtureId}:${absoluteIndex}`)
        .setLabel(label)
        .setStyle(label === NOT_AVAILABLE_VALUE ? ButtonStyle.Secondary : ButtonStyle.Primary);
    })
  ));

  const suggestionButton = new ButtonBuilder()
    .setCustomId(`suggest_date:${fixtureId}`)
    .setLabel(SUGGEST_DATE_BUTTON_LABEL)
    .setStyle(ButtonStyle.Success);

  if (rows.length === 0) {
    return [new ActionRowBuilder().addComponents(suggestionButton)];
  }

  const lastRow = rows[rows.length - 1];

  if (lastRow.components.length < 5) {
    lastRow.addComponents(suggestionButton);
    return rows;
  }

  if (rows.length < 5) {
    rows.push(new ActionRowBuilder().addComponents(suggestionButton));
  }

  return rows;
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

function formatDateSuggestions(dateSuggestions) {
  if (dateSuggestions.length === 0) {
    return '_No suggestions yet_';
  }

  const grouped = new Map();

  for (const suggestion of dateSuggestions) {
    const key = `${suggestion.suggestedDate}|${suggestion.suggestedHour}|${suggestion.suggestedMinute}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        label: `${suggestion.suggestedDate} ${formatSuggestedTime(suggestion.suggestedHour, suggestion.suggestedMinute)}`,
        users: []
      });
    }

    grouped.get(key).users.push(`<@${suggestion.userId}>`);
  }

  return [...grouped.values()]
    .map(({ label, users }) => `**${label}**\n${users.join(', ')}`)
    .join('\n\n');
}

function createSuggestionDateSelectRow(fixtureId, messageId, defaultDates) {
  const options = normalizeDbStringList(defaultDates).map((label, index) => ({
    label,
    value: String(index)
  }));

  if (options.length === 0) {
    throw new Error('At least one default date is required to build a suggestion picker.');
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`suggest_date_select:${fixtureId}:${messageId}`)
      .setPlaceholder('Choose a date to suggest a time for')
      .addOptions(options)
  );
}

function createSuggestionTimeModal(fixtureId, messageId, selectedIndex) {
  return new ModalBuilder()
    .setCustomId(`suggest_date_modal:${fixtureId}:${messageId}:${selectedIndex}`)
    .setTitle('Suggest a date')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('hour')
          .setLabel('Hour (0-23)')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(2)
          .setRequired(true)
          .setPlaceholder('20')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('minute')
          .setLabel('Minute (0-59)')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(2)
          .setRequired(true)
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
  createSuggestionDateSelectRow,
  createSuggestionTimeModal,
  createTeamSelectRows
};
