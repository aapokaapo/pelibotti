const { parse } = require('csv-parse/sync');

function parseCsv(text) {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

module.exports = {
  parseCsv
};
