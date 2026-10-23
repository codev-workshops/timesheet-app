// Closed-form ridge regression on standardized features with an unpenalized intercept.

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const p = M[col][col];
    if (Math.abs(p) < 1e-12) throw new Error('Singular system in ridge solve');
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / p;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function columnStats(X) {
  const d = X[0].length;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(0);
  for (const x of X) for (let j = 0; j < d; j++) means[j] += x[j] / X.length;
  for (const x of X) for (let j = 0; j < d; j++) stds[j] += (x[j] - means[j]) ** 2 / X.length;
  // Constant columns get std 1 so they standardize to 0 instead of dividing by zero.
  return { means, stds: stds.map((v) => (v > 1e-12 ? Math.sqrt(v) : 1)) };
}

function standardize(x, means, stds) {
  return x.map((v, j) => (v - means[j]) / stds[j]);
}

function fitRidge(X, y, lambda) {
  const { means, stds } = columnStats(X);
  const Z = X.map((x) => standardize(x, means, stds));
  const d = means.length;
  const yMean = y.reduce((s, v) => s + v, 0) / y.length;
  const A = Array.from({ length: d }, () => new Array(d).fill(0));
  const b = new Array(d).fill(0);
  Z.forEach((z, i) => {
    const yc = y[i] - yMean;
    for (let j = 0; j < d; j++) {
      b[j] += z[j] * yc;
      for (let k = j; k < d; k++) A[j][k] += z[j] * z[k];
    }
  });
  for (let j = 0; j < d; j++) {
    for (let k = 0; k < j; k++) A[j][k] = A[k][j];
    A[j][j] += lambda;
  }
  return { lambda, intercept: yMean, weights: solve(A, b), means, stds };
}

function predictRidge(model, x) {
  const z = standardize(x, model.means, model.stds);
  return z.reduce((s, v, j) => s + v * model.weights[j], model.intercept);
}

module.exports = { fitRidge, predictRidge, solve };
