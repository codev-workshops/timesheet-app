const { workEntrySchema, clientSchema } = require('../../validation/schemas');
const { generateDataset } = require('../../database/seed');
const { fitRidge, predictRidge } = require('../../ml/ridge');
const { regressionMetrics } = require('../../ml/evaluate');
const { fitBaseline, predictClientMean } = require('../../ml/baseline');
const { timeSplit, parseCsv } = require('../../ml/train');
const { toCsv } = require('../../database/seed');

describe('seed generator', () => {
  const { clients, entries } = generateDataset({ entryCount: 400 });

  test('is deterministic for a given seed', () => {
    expect(generateDataset({ entryCount: 400 })).toEqual({ clients, entries });
    expect(generateDataset({ entryCount: 400, seed: 7 }).entries).not.toEqual(entries);
  });

  test('every row honors the Joi schemas', () => {
    for (const c of clients) expect(clientSchema.validate(c).error).toBeUndefined();
    for (const e of entries) {
      const { error } = workEntrySchema.validate({ clientId: e.clientIndex + 1, hours: e.hours, description: e.description, date: e.date });
      expect(error).toBeUndefined();
    }
  });

  test('includes empty descriptions and weekday clustering', () => {
    expect(entries.some((e) => e.description === '')).toBe(true);
    const weekend = entries.filter((e) => [0, 6].includes(new Date(`${e.date}T00:00:00Z`).getUTCDay())).length;
    expect(weekend / entries.length).toBeLessThan(0.05);
  });

  test('CSV dump round-trips through the training parser', () => {
    const rows = parseCsv(toCsv(entries.slice(0, 5)));
    expect(rows[0]).toMatchObject({ client_name: entries[0].clientName, description: entries[0].description, date: entries[0].date });
    expect(Number(rows[0].hours)).toBe(entries[0].hours);
  });
});

describe('training helpers', () => {
  test('ridge recovers a linear rule', () => {
    const X = [];
    const y = [];
    for (let i = 0; i < 50; i++) {
      X.push([i % 2, (i % 7) / 7]);
      y.push(1 + 2 * (i % 2) - 3 * ((i % 7) / 7));
    }
    const model = fitRidge(X, y, 1e-6);
    expect(predictRidge(model, [1, 0.5])).toBeCloseTo(1.5, 4);
  });

  test('regression metrics', () => {
    expect(regressionMetrics([1, 2, 3], [1, 2, 3])).toEqual({ n: 3, mae: 0, rmse: 0, r2: 1 });
    expect(regressionMetrics([1, 3], [2, 2]).mae).toBe(1);
  });

  test('per-client baseline falls back to global mean', () => {
    const b = fitBaseline([{ clientId: 1, hours: 2 }, { clientId: 1, hours: 4 }, { clientId: 2, hours: 6 }]);
    expect(predictClientMean(b, 1)).toBe(3);
    expect(predictClientMean(b, 9)).toBe(4);
  });

  test('time split holds out the most recent days without overlap', () => {
    const rows = ['2026-01-01', '2026-01-02', '2026-01-02', '2026-01-03', '2026-01-04'].map((d) => ({ date: new Date(d) }));
    const { train, test } = timeSplit(rows, 0.4);
    expect(Math.max(...train.map((r) => r.date))).toBeLessThan(Math.min(...test.map((r) => r.date)));
    expect(train.length + test.length).toBe(rows.length);
  });
});
