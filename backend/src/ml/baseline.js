// Mean-hours baselines the model has to beat.

function mean(values) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function fitBaseline(rows) {
  if (!rows.length) throw new Error('fitBaseline needs at least one row');
  const byClient = {};
  for (const r of rows) (byClient[r.clientId] = byClient[r.clientId] || []).push(r.hours);
  const perClient = {};
  for (const id of Object.keys(byClient)) perClient[id] = mean(byClient[id]);
  return { global: mean(rows.map((r) => r.hours)), perClient };
}

function predictClientMean(baseline, clientId) {
  const value = baseline.perClient[clientId];
  return value === undefined ? baseline.global : value;
}

function predictGlobalMean(baseline) {
  return baseline.global;
}

module.exports = { fitBaseline, predictClientMean, predictGlobalMean };
