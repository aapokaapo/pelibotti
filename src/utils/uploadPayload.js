const { parseCsv } = require('./csv');

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function parseUploadedPayload({ fileName, rawText, expectedKey }) {
  const extension = fileName?.split('.').pop()?.toLowerCase();

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

    throw new Error('JSON upload must contain an array payload.');
  }

  if (extension === 'csv') {
    return parseCsv(rawText);
  }

  throw new Error('Unsupported upload type. Use a .csv or .json file.');
}

module.exports = {
  MAX_UPLOAD_BYTES,
  parseUploadedPayload
};
