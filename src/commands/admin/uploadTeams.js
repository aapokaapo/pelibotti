const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const { fetchAttachmentPayload } = require('../../utils/attachments');
const { importTeams } = require('../../utils/importers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upload_teams')
    .setDescription('Bulk create or update teams from a CSV or JSON attachment.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption((option) =>
      option
        .setName('file')
        .setDescription('CSV or JSON file containing team records')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const attachment = interaction.options.getAttachment('file', true);
    const rows = await fetchAttachmentPayload(attachment, 'teams');
    const count = await importTeams(rows);

    await interaction.editReply(`Imported ${count} team record(s).`);
  }
};
