function normalizeDbStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function hasDbStringListEntries(value) {
  return normalizeDbStringList(value).length > 0;
}

module.exports = {
  hasDbStringListEntries,
  normalizeDbStringList
};
