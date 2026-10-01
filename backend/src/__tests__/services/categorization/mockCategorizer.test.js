const { MockCategorizer, scoreDescription } = require('../../../services/categorization/mockCategorizer');
const { CATEGORY_NAMES } = require('../../../services/categorization/categories');
const { CATEGORY_TEMPLATES } = require('../../../scripts/seedTestData');

describe('MockCategorizer', () => {
  const categorizer = new MockCategorizer();

  test('categorizes keyword descriptions', async () => {
    const results = await categorizer.categorizeBatch(
      ['Daily standup', 'Fix bug in code', 'Wrote unit tests', 'worked on stuff'],
      CATEGORY_NAMES
    );
    expect(results.map(r => r.category)).toEqual(['meetings', 'development', 'testing', 'uncategorized']);
    expect(results[0].confidence).toBeGreaterThan(results[3].confidence);
  });

  test.each(Object.entries(CATEGORY_TEMPLATES))('categorizes every %s template', async (category, descriptions) => {
    const results = await categorizer.categorizeBatch(descriptions, CATEGORY_NAMES);
    expect(results.every(r => r.category === category)).toBe(true);
  });

  test('picks the category with most keyword hits for multi-category text', () => {
    expect(scoreDescription('Standup, then fixed the login bug').category).toBe('development');
  });

  test('falls back to uncategorized when the match is not an allowed category', async () => {
    const [result] = await categorizer.categorizeBatch(['Daily standup'], ['development', 'uncategorized']);
    expect(result.category).toBe('uncategorized');
  });

  test('is deterministic', async () => {
    const input = ['Sprint planning meeting', 'Figma mockups'];
    expect(await categorizer.categorizeBatch(input, CATEGORY_NAMES))
      .toEqual(await categorizer.categorizeBatch(input, CATEGORY_NAMES));
  });
});
