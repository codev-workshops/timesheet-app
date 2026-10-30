const DAY_MS = 24 * 60 * 60 * 1000;

// work_entries.date is stored as epoch milliseconds; bind it explicitly rather than relying on
// the sqlite3 binding's Date detection (which fails for Dates created in another realm, e.g. under Jest).
function toDateMs(date) {
  return new Date(date).getTime();
}

// Returns the [start, end) epoch-ms bounds of the Mon–Sun (UTC) week containing `date`.
function getWeekBounds(date) {
  const d = new Date(date);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday);
  return { start, end: start + 7 * DAY_MS };
}

function formatHours(h) {
  return String(Number(h.toFixed(2)));
}

function capExceededMessage(total, cap) {
  return `Weekly hours cap exceeded: this entry would bring the week to ${formatHours(total)}h for this client (cap ${formatHours(cap)}h)`;
}

// Checks whether adding `hours` on `date` keeps the user's weekly total for the client within `cap`.
// `previousHours` is what this entry already contributed to the same client/week bucket (updates only);
// an update that does not increase that contribution is always allowed so an over-cap week can be reduced.
// cb(err, { ok, total, cap }) — `total` is the projected week total including this entry.
function checkWeeklyCap(db, { userEmail, clientId, date, hours, cap, excludeEntryId, previousHours }, cb) {
  if (cap === null || cap === undefined) {
    return cb(null, { ok: true });
  }

  if (previousHours !== undefined && hours <= previousHours) {
    return cb(null, { ok: true });
  }

  const { start, end } = getWeekBounds(date);
  let query = `SELECT COALESCE(SUM(hours), 0) AS total
     FROM work_entries
     WHERE user_email = ? AND client_id = ? AND date >= ? AND date < ?`;
  const params = [userEmail, clientId, start, end];

  if (excludeEntryId !== undefined) {
    query += ' AND id != ?';
    params.push(excludeEntryId);
  }

  db.get(query, params, (err, row) => {
    if (err) return cb(err);
    const total = Math.round(((row ? row.total : 0) + hours) * 100) / 100;
    cb(null, { ok: total <= cap, total, cap });
  });
}

module.exports = { getWeekBounds, checkWeeklyCap, capExceededMessage, toDateMs };
