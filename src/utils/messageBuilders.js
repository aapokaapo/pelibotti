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
const SUGGEST_DATE_BUTTON_LABEL = 'Suggest Custom Date';

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

function formatDateSuggestions(dateSuggestions) {
  if (dateSuggestions.length === 0) {
    return '_No suggestions yet_';
  }

  const grouped = new Map();

  for (const suggestion of dateSuggestions) {
    const key = suggestion.suggestedLabel;

    if (!grouped.has(key)) {
      grouped.set(key, {
        label: suggestion.suggestedLabel,
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
          .setMaxLength(100)
          .setPlaceholder('Tue 20:00 or 2026-01-15 20:00')
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
  createSuggestionTimeModal,
  createTeamSelectRows
};
