const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const { fetchAttachmentPayload } = require('../../utils/attachments');
const { importMapPools } = require('../../utils/importers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upload_maps')
    .setDescription('Bulk create or update weekly map pools for this channel from a CSV or JSON attachment.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption((option) =>
      option
        .setName('file')
        .setDescription('CSV or JSON file containing map pool records')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guildId) {
      throw new Error('This command can only be used inside a server.');
    }

    const attachment = interaction.options.getAttachment('file', true);
    const rows = await fetchAttachmentPayload(attachment, 'mapPools');
    const count = await importMapPools(interaction.guildId, interaction.channelId, rows);

    await interaction.editReply(`Imported ${count} map pool record(s).`);
  }
};
