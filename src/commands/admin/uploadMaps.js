const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const { fetchAttachmentPayload } = require('../../utils/attachments');
const { importMapPools } = require('../../utils/importers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upload_maps')
    .setDescription('Bulk create or update weekly map pools for configured channels, or save guild defaults.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption((option) =>
      option
        .setName('file')
        .setDescription('CSV or JSON file containing map pool records')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const attachment = interaction.options.getAttachment('file', true);
    const rows = await fetchAttachmentPayload(attachment, 'mapPools');
    const count = await importMapPools(rows);

    await interaction.editReply(`Imported ${count} map pool record(s).`);
  }
};
