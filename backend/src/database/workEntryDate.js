const workEntryDateColumn = `CASE
  WHEN typeof(we.date) IN ('integer', 'real') THEN date(we.date / 1000.0, 'unixepoch')
  ELSE we.date
END AS date`;

module.exports = { workEntryDateColumn };
