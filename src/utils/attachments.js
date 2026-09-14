const { parseUploadedPayload } = require('./uploadPayload');

const ALLOWED_ATTACHMENT_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net'
]);

async function fetchAttachmentPayload(attachment, expectedKey) {
  const attachmentUrl = new URL(attachment.url);

  if (!ALLOWED_ATTACHMENT_HOSTS.has(attachmentUrl.hostname)) {
    throw new Error('Attachment URL must be hosted by Discord.');
  }

  const response = await fetch(attachment.url);

  if (!response.ok) {
    throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
  }

  const rawText = await response.text();

  return parseUploadedPayload({
    fileName: attachment.name,
    rawText,
    expectedKey
  });
}

module.exports = {
  fetchAttachmentPayload
};
