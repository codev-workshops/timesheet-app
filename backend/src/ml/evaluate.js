// Regression metrics + model-vs-baseline comparison on a held-out split.

function regressionMetrics(yTrue, yPred) {
  const n = yTrue.length;
  if (!n || n !== yPred.length) throw new Error('regressionMetrics needs equal-length, non-empty arrays');
  const yMean = yTrue.reduce((s, v) => s + v, 0) / n;
  let absErr = 0;
  let sqErr = 0;
  let sqTot = 0;
  for (let i = 0; i < n; i++) {
    absErr += Math.abs(yTrue[i] - yPred[i]);
    sqErr += (yTrue[i] - yPred[i]) ** 2;
    sqTot += (yTrue[i] - yMean) ** 2;
  }
  return { n, mae: absErr / n, rmse: Math.sqrt(sqErr / n), r2: sqTot > 0 ? 1 - sqErr / sqTot : 0 };
}

function round(v, digits = 4) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function compareToBaselines(yTrue, predictions) {
  const results = {};
  for (const [name, yPred] of Object.entries(predictions)) {
    const m = regressionMetrics(yTrue, yPred);
    results[name] = { n: m.n, mae: round(m.mae), rmse: round(m.rmse), r2: round(m.r2) };
  }
  return results;
}

function formatTable(results) {
  const lines = ['| model | n | MAE | RMSE | R² |', '|---|---|---|---|---|'];
  for (const [name, m] of Object.entries(results)) lines.push(`| ${name} | ${m.n} | ${m.mae} | ${m.rmse} | ${m.r2} |`);
  return lines.join('\n');
}

module.exports = { regressionMetrics, compareToBaselines, formatTable };
