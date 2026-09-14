const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const NOT_AVAILABLE_VALUE = 'Not Available';

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
  const buttonLabels = [...defaultDates, NOT_AVAILABLE_VALUE];

  return chunk(buttonLabels, 5).map((labelChunk, rowIndex) => new ActionRowBuilder().addComponents(
    ...labelChunk.map((label, buttonIndex) => {
      const absoluteIndex = rowIndex * 5 + buttonIndex;
      return new ButtonBuilder()
        .setCustomId(`availability:${fixtureId}:${absoluteIndex}`)
        .setLabel(label)
        .setStyle(label === NOT_AVAILABLE_VALUE ? ButtonStyle.Secondary : ButtonStyle.Primary);
    })
  ));
}

function formatAvailability(defaultDates, availabilities) {
  const grouped = new Map([...defaultDates, NOT_AVAILABLE_VALUE].map((label) => [label, []]));

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

function buildScheduleEmbed({ fixture, mapPool, defaultDates, availabilities, scheduleLabel }) {
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
        value: mapPool.maps.map((map, index) => `${index + 1}. ${map}`).join('\n'),
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
  createTeamSelectRows
};
