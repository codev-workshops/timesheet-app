const path = require('path');
const { predictHours, loadModel } = require('../../ml/predict');

describe('ml/predict', () => {
  const model = loadModel(path.join(__dirname, 'fixtures', 'tiny-model.json'));
  const base = { clientId: 1, department: 'Engineering', description: 'Fix bug', date: '2026-03-02' };

  test('returns a number within (0, 24] rounded to 2 decimals', () => {
    const hours = predictHours(base);
    expect(typeof hours).toBe('number');
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThanOrEqual(24);
    expect(Math.round(hours * 100) / 100).toBe(hours);
  });

  test('applies the fixture weights (one-hots, log length, keyword flag)', () => {
    // intercept + client=1 (+0.5) + client=2 absent (+0.5) + department (+0.2) + log length + kw=bug (+1)
    const expected = 3 + 0.5 + 0.5 + 0.2 + 0.1 * (Math.log1p(7) - 2) + 1;
    expect(predictHours(base, model)).toBeCloseTo(Math.round(expected * 100) / 100, 2);
  });

  test('clips extreme predictions into range', () => {
    const extreme = { ...model, intercept: 100 };
    expect(predictHours(base, extreme)).toBe(24);
    expect(predictHours(base, { ...model, intercept: -100 })).toBe(0.25);
  });

  test('loads the committed model.json by default', () => {
    const real = loadModel();
    expect(real.format).toBe('timesheet-hours-ridge');
    const hours = predictHours({ clientId: 1, department: 'Engineering', description: 'Implemented new reporting feature', date: '2026-10-05' }, real);
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThanOrEqual(24);
  });
});
