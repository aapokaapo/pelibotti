const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const { fetchAttachmentPayload } = require('../../utils/attachments');
const { importTeams } = require('../../utils/importers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upload_teams')
    .setDescription('Bulk create or update teams for configured guilds, or save guild defaults.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption((option) =>
      option
        .setName('file')
        .setDescription('CSV or JSON file containing team records')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const attachment = interaction.options.getAttachment('file', true);
    const rows = await fetchAttachmentPayload(attachment, 'teams');
    const guildIds = [...interaction.client.guilds.cache.keys()];
    const count = await importTeams(rows, { guildIds });

    await interaction.editReply(`Imported ${count} team record(s).`);
  }
};
