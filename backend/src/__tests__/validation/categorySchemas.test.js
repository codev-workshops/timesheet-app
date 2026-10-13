const {
  WORK_ENTRY_CATEGORIES,
  workEntrySchema,
  updateWorkEntrySchema
} = require('../../validation/schemas');

const baseEntry = { clientId: 1, hours: 2, date: '2024-01-15' };

describe('work entry category validation', () => {
  test('exports the fixed category enum', () => {
    expect(WORK_ENTRY_CATEGORIES).toEqual(['billable', 'non-billable', 'internal', 'overtime']);
  });

  test.each(WORK_ENTRY_CATEGORIES)('accepts "%s" on create and update', (category) => {
    expect(workEntrySchema.validate({ ...baseEntry, category }).error).toBeUndefined();
    expect(updateWorkEntrySchema.validate({ category }).error).toBeUndefined();
  });

  test('allows category to be omitted or null', () => {
    expect(workEntrySchema.validate(baseEntry).error).toBeUndefined();
    expect(workEntrySchema.validate({ ...baseEntry, category: null }).error).toBeUndefined();
    expect(updateWorkEntrySchema.validate({ category: null }).error).toBeUndefined();
  });

  test.each(['vacation', 'Billable', 'BILLABLE', '', ' billable', 1, true])(
    'rejects invalid category %p on create and update',
    (category) => {
      expect(workEntrySchema.validate({ ...baseEntry, category }).error).toBeDefined();
      expect(updateWorkEntrySchema.validate({ category }).error).toBeDefined();
    }
  );
});
