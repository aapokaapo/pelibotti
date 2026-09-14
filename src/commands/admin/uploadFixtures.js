const { PrismaClient } = require('@prisma/client');
// Adjust this import path depending on where your Prisma client is instantiated
const prisma = new PrismaClient(); 

/**
 * Imports an array of fixture records into the database.
 * @param {Array} rows - The parsed rows from the CSV/JSON attachment.
 * @param {String} guildId - The Discord Guild ID (assuming it's passed or injected by your bot).
 * @returns {Number} - The number of successfully imported fixtures.
 */
async function importFixtures(rows, guildId) {
  let importCount = 0;

  for (const row of rows) {
    // Determine the map pool:
    // 1. Check if the slash command injected `mapPool`
    // 2. Fallback to the CSV column `pool`
    // 3. Default to 'A' if neither exists
    const poolValue = row.mapPool || row.pool || 'A';

    // Since the CSV provides team names (teamAName, teamBName), 
    // we need to look up their database IDs.
    const teamA = await prisma.team.findFirst({
      where: { name: row.teamAName, guildId: guildId }
    });

    const teamB = await prisma.team.findFirst({
      where: { name: row.teamBName, guildId: guildId }
    });

    if (!teamA || !teamB) {
      console.warn(`Skipping fixture week \({row.weekNumber}: Could not find one or both teams (\){row.teamAName} vs ${row.teamBName}).`);
      continue;
    }

    // Upsert the fixture into the database
    await prisma.fixture.upsert({
      where: {
        // Using the unique constraint defined in your schema
        guildId_channelId_weekNumber_teamAId_teamBId: {
          guildId: guildId,
          channelId: row.channelId || null, // Assuming channelId might be optional in your flow
          weekNumber: parseInt(row.weekNumber, 10),
          teamAId: teamA.id,
          teamBId: teamB.id,
        }
      },
      update: {
        mapPool: poolValue, // Update the map pool if the fixture already exists
      },
      create: {
        guildId: guildId,
        channelId: row.channelId || null,
        weekNumber: parseInt(row.weekNumber, 10),
        mapPool: poolValue, // Save the parsed pool value
        teamAId: teamA.id,
        teamBId: teamB.id,
      }
    });

    importCount++;
  }

  return importCount;
}

module.exports = {
  importFixtures
};
