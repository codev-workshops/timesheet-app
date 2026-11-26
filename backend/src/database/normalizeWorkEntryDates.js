module.exports = {
  version: 4,
  name: 'normalize_work_entry_dates',
  sql: `
      UPDATE work_entries
      SET date = date(date / 1000.0, 'unixepoch')
      WHERE typeof(date) IN ('integer', 'real')
        AND length(date(date / 1000.0, 'unixepoch')) = 10;
  `
};
