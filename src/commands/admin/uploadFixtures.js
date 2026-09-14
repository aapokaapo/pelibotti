const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const { fetchAttachmentPayload } = require('../../utils/attachments');
const { importFixtures } = require('../../utils/importers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upload_fixtures')
    .setDescription('Bulk create or update fixtures for all configured channels from a CSV or JSON attachment.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption((option) =>
      option
        .setName('file')
        .setDescription('CSV or JSON file containing fixture records')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const attachment = interaction.options.getAttachment('file', true);
    const rows = await fetchAttachmentPayload(attachment, 'fixtures');
    const count = await importFixtures(rows);

    await interaction.editReply(`Imported ${count} fixture record(s).`);
  }
};
