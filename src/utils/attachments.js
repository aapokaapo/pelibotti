const { MAX_UPLOAD_BYTES, parseUploadedPayload } = require('./uploadPayload');

const ALLOWED_ATTACHMENT_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net'
]);

async function fetchAttachmentPayload(attachment, expectedKey) {
  const attachmentUrl = new URL(attachment.url);

  if (!ALLOWED_ATTACHMENT_HOSTS.has(attachmentUrl.hostname)) {
    throw new Error('Attachment URL must be hosted by Discord.');
  }

  if (typeof attachment.size === 'number' && attachment.size > MAX_UPLOAD_BYTES) {
    throw new Error('Attachment exceeds the 2 MB upload limit.');
  }

  const response = await fetch(attachment.url);

  if (!response.ok) {
    throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_UPLOAD_BYTES) {
    throw new Error('Attachment exceeds the 2 MB upload limit.');
  }

  if (!response.body) {
    throw new Error('Attachment response did not include a readable body.');
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MAX_UPLOAD_BYTES) {
      throw new Error('Attachment exceeds the 2 MB upload limit.');
    }

    chunks.push(buffer);
  }

  const rawText = Buffer.concat(chunks).toString('utf8');

  return parseUploadedPayload({
    fileName: attachment.name,
    rawText,
    expectedKey
  });
}

module.exports = {
  fetchAttachmentPayload
};
