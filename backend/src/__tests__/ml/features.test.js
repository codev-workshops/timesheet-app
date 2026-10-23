const { buildFeatures, toVector, featureNames, buildVocabulary } = require('../../ml/features');

describe('ml/features', () => {
  const input = { clientId: 2, department: ' Engineering ', description: 'Fixed login bug before release', date: '2026-03-02' };

  test('engineers date, description and categorical features', () => {
    expect(buildFeatures(input)).toEqual({
      clientId: 2,
      department: 'engineering',
      dayOfWeek: 1,
      month: 3,
      descriptionLength: 30,
      wordCount: 5,
      isEmptyDescription: 0,
      keywords: { bug: 1, deploy: 1, meeting: 0, review: 0, docs: 0, feature: 0, test: 0 }
    });
  });

  test('is deterministic and accepts Date, epoch ms and ISO strings', () => {
    const ms = Date.parse('2026-03-02T00:00:00Z');
    expect(buildFeatures(input)).toEqual(buildFeatures(input));
    expect(buildFeatures({ ...input, date: new Date(ms) })).toEqual(buildFeatures(input));
    expect(buildFeatures({ ...input, date: ms })).toEqual(buildFeatures(input));
    expect(buildFeatures({ ...input, date: String(ms) })).toEqual(buildFeatures(input));
  });

  test('handles empty description and missing department', () => {
    const f = buildFeatures({ clientId: 1, description: '', date: '2026-01-04' });
    expect(f).toMatchObject({ department: '', dayOfWeek: 0, descriptionLength: 0, wordCount: 0, isEmptyDescription: 1 });
    expect(Object.values(f.keywords).every((v) => v === 0)).toBe(true);
  });

  test('throws on invalid date', () => {
    expect(() => buildFeatures({ ...input, date: 'not-a-date' })).toThrow('Invalid date');
  });

  test('vectorizes with one-hot encoding and unseen categories as zeros', () => {
    const meta = buildVocabulary([
      { clientId: 2, department: 'Engineering' },
      { clientId: 1, department: 'Finance' },
      { clientId: 1, department: '' }
    ]);
    expect(meta).toEqual({ clientIds: [1, 2], departments: ['engineering', 'finance'] });
    const names = featureNames(meta);
    const vec = toVector(buildFeatures(input), meta);
    expect(vec).toHaveLength(names.length);
    const at = (name) => vec[names.indexOf(name)];
    expect([at('client=1'), at('client=2'), at('department=engineering'), at('department=finance')]).toEqual([0, 1, 1, 0]);
    expect(at('dow=mon')).toBe(1);
    expect(at('kw=bug')).toBe(1);
    expect(at('log_description_length')).toBeCloseTo(Math.log1p(30));
    const unseen = toVector(buildFeatures({ ...input, clientId: 99, department: 'Legal' }), meta);
    expect(unseen.slice(0, 4)).toEqual([0, 0, 0, 0]);
  });
});
