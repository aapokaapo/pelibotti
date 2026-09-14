const { parseCsv } = require('./csv');

async function fetchAttachmentPayload(attachment, expectedKey) {
  const response = await fetch(attachment.url);

  if (!response.ok) {
    throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
  }

  const rawText = await response.text();
  const extension = attachment.name?.split('.').pop()?.toLowerCase();

  if (extension === 'json') {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (Array.isArray(parsed?.[expectedKey])) {
      return parsed[expectedKey];
    }

    const firstArrayValue = Object.values(parsed).find(Array.isArray);
    if (firstArrayValue) {
      return firstArrayValue;
    }

    throw new Error('JSON attachment must contain an array payload.');
  }

  if (extension === 'csv') {
    return parseCsv(rawText);
  }

  throw new Error('Unsupported attachment type. Upload a .csv or .json file.');
}

module.exports = {
  fetchAttachmentPayload
};
