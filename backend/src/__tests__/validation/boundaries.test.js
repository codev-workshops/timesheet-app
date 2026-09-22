const {
  clientSchema,
  workEntrySchema,
  updateWorkEntrySchema,
  emailSchema
} = require('../../validation/schemas');

const failingKey = (error) => error && error.details[0].path.join('.');

describe('Schema boundary conditions', () => {
  describe('workEntrySchema.hours', () => {
    const base = { clientId: 1, date: '2024-01-01' };

    test.each([
      [0.01, true],
      [24, true],
      [0, false],
      [-1, false],
      [24.01, false]
    ])('hours=%p valid=%p', (hours, valid) => {
      const { error } = workEntrySchema.validate({ ...base, hours });
      if (valid) {
        expect(error).toBeUndefined();
      } else {
        expect(failingKey(error)).toBe('hours');
      }
    });

    test('precision(2) rounds by default and rejects without conversion', () => {
      const rounded = workEntrySchema.validate({ ...base, hours: 1.999 });
      expect(rounded.error).toBeUndefined();
      expect(rounded.value.hours).toBe(2);

      const strict = workEntrySchema.validate({ ...base, hours: 1.999 }, { convert: false });
      expect(failingKey(strict.error)).toBe('hours');
    });

    test('rounding cannot push 23.999 past the max of 24', () => {
      const { error, value } = workEntrySchema.validate({ ...base, hours: 23.999 });
      expect(error).toBeUndefined();
      expect(value.hours).toBe(24);
    });
  });

  describe('workEntrySchema.date', () => {
    const base = { clientId: 1, hours: 1 };

    test('accepts far-past and far-future ISO dates (no range enforced)', () => {
      expect(workEntrySchema.validate({ ...base, date: '1900-01-01' }).error).toBeUndefined();
      expect(workEntrySchema.validate({ ...base, date: '2999-12-31' }).error).toBeUndefined();
    });

    test('rejects non-ISO strings and garbage', () => {
      expect(failingKey(workEntrySchema.validate({ ...base, date: '01/15/2024' }).error)).toBe('date');
      expect(failingKey(workEntrySchema.validate({ ...base, date: 'not-a-date' }).error)).toBe('date');
    });

    test('documents gap: impossible calendar date 2024-02-30 is accepted and rolled over by Date', () => {
      const { error, value } = workEntrySchema.validate({ ...base, date: '2024-02-30' });
      expect(error).toBeUndefined();
      expect(value.date.toISOString().slice(0, 10)).toBe('2024-03-01');
    });
  });

  describe('string length boundaries', () => {
    test('name: 1 char ok, whitespace-only (trims to 0) rejected, 255 ok, 256 rejected', () => {
      expect(clientSchema.validate({ name: 'a' }).error).toBeUndefined();
      expect(failingKey(clientSchema.validate({ name: '   ' }).error)).toBe('name');
      expect(clientSchema.validate({ name: 'a'.repeat(255) }).error).toBeUndefined();
      expect(failingKey(clientSchema.validate({ name: 'a'.repeat(256) }).error)).toBe('name');
    });

    test('description: 1000 ok, 1001 rejected (client and work entry)', () => {
      expect(clientSchema.validate({ name: 'x', description: 'd'.repeat(1000) }).error).toBeUndefined();
      expect(failingKey(clientSchema.validate({ name: 'x', description: 'd'.repeat(1001) }).error)).toBe('description');
      expect(
        failingKey(updateWorkEntrySchema.validate({ description: 'd'.repeat(1001) }).error)
      ).toBe('description');
    });

    test('department and email: 255 ok, 256 rejected', () => {
      expect(clientSchema.validate({ name: 'x', department: 'd'.repeat(255) }).error).toBeUndefined();
      expect(failingKey(clientSchema.validate({ name: 'x', department: 'd'.repeat(256) }).error)).toBe('department');
      const longEmail = `${'a'.repeat(250)}@x.io`;
      expect(failingKey(clientSchema.validate({ name: 'x', email: longEmail }).error)).toBe('email');
    });
  });

  describe('email validator parity (auth.js regex vs Joi emailSchema)', () => {
    // Regex copied from backend/src/middleware/auth.js
    const authRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const joiAccepts = (email) => emailSchema.validate({ email }).error === undefined;

    test.each([
      'user@example.com',
      'first.last+tag@sub.example.co.uk'
    ])('both validators accept %s', (email) => {
      expect(authRegex.test(email)).toBe(true);
      expect(joiAccepts(email)).toBe(true);
    });

    test.each(['plainaddress', 'a@b', 'a b@example.com', '@example.com'])(
      'both validators reject %s',
      (email) => {
        expect(authRegex.test(email)).toBe(false);
        expect(joiAccepts(email)).toBe(false);
      }
    );

    test('documents known divergence: regex accepts inputs Joi rejects', () => {
      const divergent = ['user@localhost.x', 'user@exa_mple.com', 'a@-b.com'];
      const onlyRegex = divergent.filter((e) => authRegex.test(e) && !joiAccepts(e));
      expect(onlyRegex.length).toBeGreaterThan(0);
    });
  });
});
