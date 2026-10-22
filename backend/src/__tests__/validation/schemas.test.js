const {
  clientSchema,
  workEntrySchema,
  updateWorkEntrySchema,
  updateClientSchema,
  emailSchema
} = require('../../validation/schemas');

describe('Validation Schemas', () => {
  describe('clientSchema', () => {
    test('should validate valid client data', () => {
      const validClient = {
        name: 'Test Client',
        description: 'A test client'
      };

      const { error } = clientSchema.validate(validClient);
      expect(error).toBeUndefined();
    });

    test('should allow empty description', () => {
      const client = {
        name: 'Test Client',
        description: ''
      };

      const { error } = clientSchema.validate(client);
      expect(error).toBeUndefined();
    });

    test('should allow missing description', () => {
      const client = {
        name: 'Test Client'
      };

      const { error } = clientSchema.validate(client);
      expect(error).toBeUndefined();
    });

    test('should reject missing name', () => {
      const client = {
        description: 'No name'
      };

      const { error } = clientSchema.validate(client);
      expect(error).toBeDefined();
    });

    test('should reject empty name', () => {
      const client = {
        name: '',
        description: 'Empty name'
      };

      const { error } = clientSchema.validate(client);
      expect(error).toBeDefined();
    });

    test('should reject name longer than 255 characters', () => {
      const client = {
        name: 'a'.repeat(256)
      };

      const { error } = clientSchema.validate(client);
      expect(error).toBeDefined();
    });

    test('should reject description longer than 1000 characters', () => {
      const client = {
        name: 'Test',
        description: 'a'.repeat(1001)
      };

      const { error } = clientSchema.validate(client);
      expect(error).toBeDefined();
    });

    test('should trim whitespace from name', () => {
      const client = {
        name: '  Test Client  '
      };

      const { value } = clientSchema.validate(client);
      expect(value.name).toBe('Test Client');
    });
  });

  describe('workEntrySchema', () => {
    test('should validate valid work entry', () => {
      const validEntry = {
        clientId: 1,
        hours: 5.5,
        description: 'Development work',
        date: '2024-01-15'
      };

      const { error } = workEntrySchema.validate(validEntry);
      expect(error).toBeUndefined();
    });

    test('should allow empty description', () => {
      const entry = {
        clientId: 1,
        hours: 5,
        description: '',
        date: '2024-01-15'
      };

      const { error } = workEntrySchema.validate(entry);
      expect(error).toBeUndefined();
    });

    test('should reject missing clientId', () => {
      const entry = {
        hours: 5,
        date: '2024-01-15'
      };

      const { error } = workEntrySchema.validate(entry);
      expect(error).toBeDefined();
    });

    test('should reject negative clientId', () => {
      const entry = {
        clientId: -1,
        hours: 5,
        date: '2024-01-15'
      };

      const { error } = workEntrySchema.validate(entry);
      expect(error).toBeDefined();
    });

    test('should reject zero clientId', () => {
      const entry = {
        clientId: 0,
        hours: 5,
        date: '2024-01-15'
      };

      const { error } = workEntrySchema.validate(entry);
      expect(error).toBeDefined();
    });

    test('should reject missing hours', () => {
      const entry = {
        clientId: 1,
        date: '2024-01-15'
      };

      const { error } = workEntrySchema.validate(entry);
      expect(error).toBeDefined();
    });

    test('should reject negative hours', () => {
      const entry = {
        clientId: 1,
        hours: -5,
        date: '2024-01-15'
      };

      const { error } = workEntrySchema.validate(entry);
      expect(error).toBeDefined();
    });

    test('should reject hours greater than 24', () => {
      const entry = {
        clientId: 1,
        hours: 25,
        date: '2024-01-15'
      };

      const { error } = workEntrySchema.validate(entry);
      expect(error).toBeDefined();
    });

    test('should accept decimal hours', () => {
      const entry = {
        clientId: 1,
        hours: 7.75,
        date: '2024-01-15'
      };

      const { error } = workEntrySchema.validate(entry);
      expect(error).toBeUndefined();
    });

    test('should reject missing date', () => {
      const entry = {
        clientId: 1,
        hours: 5
      };

      const { error } = workEntrySchema.validate(entry);
      expect(error).toBeDefined();
    });

    test('should reject invalid date format', () => {
      const entry = {
        clientId: 1,
        hours: 5,
        date: '01/15/2024'
      };

      const { error } = workEntrySchema.validate(entry);
      expect(error).toBeDefined();
    });
  });

  describe('updateWorkEntrySchema', () => {
    test('should validate partial update', () => {
      const update = {
        hours: 8
      };

      const { error } = updateWorkEntrySchema.validate(update);
      expect(error).toBeUndefined();
    });

    test('should validate multiple field update', () => {
      const update = {
        hours: 8,
        description: 'Updated description'
      };

      const { error } = updateWorkEntrySchema.validate(update);
      expect(error).toBeUndefined();
    });

    test('should reject empty update', () => {
      const update = {};

      const { error } = updateWorkEntrySchema.validate(update);
      expect(error).toBeDefined();
    });

    test('should validate clientId update', () => {
      const update = {
        clientId: 2
      };

      const { error } = updateWorkEntrySchema.validate(update);
      expect(error).toBeUndefined();
    });

    test('should validate date update', () => {
      const update = {
        date: '2024-02-01'
      };

      const { error } = updateWorkEntrySchema.validate(update);
      expect(error).toBeUndefined();
    });
  });

  describe('updateClientSchema', () => {
    test('should validate name update', () => {
      const update = {
        name: 'Updated Name'
      };

      const { error } = updateClientSchema.validate(update);
      expect(error).toBeUndefined();
    });

    test('should validate description update', () => {
      const update = {
        description: 'Updated description'
      };

      const { error } = updateClientSchema.validate(update);
      expect(error).toBeUndefined();
    });

    test('should reject empty update', () => {
      const update = {};

      const { error } = updateClientSchema.validate(update);
      expect(error).toBeDefined();
    });

    test('should validate both fields update', () => {
      const update = {
        name: 'New Name',
        description: 'New Description'
      };

      const { error } = updateClientSchema.validate(update);
      expect(error).toBeUndefined();
    });
  });

  describe('emailSchema', () => {
    test('should validate valid email', () => {
      const data = {
        email: 'test@example.com'
      };

      const { error } = emailSchema.validate(data);
      expect(error).toBeUndefined();
    });

    test('should reject invalid email', () => {
      const data = {
        email: 'not-an-email'
      };

      const { error } = emailSchema.validate(data);
      expect(error).toBeDefined();
    });

    test('should reject missing email', () => {
      const data = {};

      const { error } = emailSchema.validate(data);
      expect(error).toBeDefined();
    });

    test('should accept email with subdomain', () => {
      const data = {
        email: 'user@mail.example.com'
      };

      const { error } = emailSchema.validate(data);
      expect(error).toBeUndefined();
    });
  });


  describe('hours boundaries', () => {
    const base = { clientId: 1, date: '2024-01-15' };

    test.each([
      [0, false],
      [0.01, true],
      [24, true],
      [24.01, false]
    ])('workEntrySchema hours=%p valid=%p', (hours, valid) => {
      const { error } = workEntrySchema.validate({ ...base, hours });
      expect(error === undefined).toBe(valid);
    });

    test.each([
      [0, false],
      [24, true],
      [24.01, false]
    ])('updateWorkEntrySchema hours=%p valid=%p', (hours, valid) => {
      const { error } = updateWorkEntrySchema.validate({ hours });
      expect(error === undefined).toBe(valid);
    });

    test('rounds hours to 2 decimal places', () => {
      const { value } = workEntrySchema.validate({ ...base, hours: 7.555 });
      expect(value.hours).toBe(7.56);
    });
  });


  describe('string field rules', () => {
    const workBase = { clientId: 1, hours: 1, date: '2024-01-15' };
    const cases = [
      // [schema label, schema, base payload, field, max length, allows empty]
      ['clientSchema', clientSchema, { name: 'Client' }, 'name', 255, false],
      ['clientSchema', clientSchema, { name: 'Client' }, 'description', 1000, true],
      ['clientSchema', clientSchema, { name: 'Client' }, 'department', 255, true],
      ['updateClientSchema', updateClientSchema, {}, 'name', 255, false],
      ['updateClientSchema', updateClientSchema, {}, 'description', 1000, true],
      ['updateClientSchema', updateClientSchema, {}, 'department', 255, true],
      ['workEntrySchema', workEntrySchema, workBase, 'description', 1000, true],
      ['updateWorkEntrySchema', updateWorkEntrySchema, {}, 'description', 1000, true]
    ];

    describe.each(cases)('%s.%s', (label, schema, base, field, maxLength, allowsEmpty) => {
      test('trims surrounding whitespace', () => {
        const { error, value } = schema.validate({ ...base, [field]: '  ab  ' });
        expect(error).toBeUndefined();
        expect(value[field]).toBe('ab');
      });

      test(`accepts a short value and exactly ${maxLength} characters`, () => {
        expect(schema.validate({ ...base, [field]: 'ab' }).error).toBeUndefined();
        expect(schema.validate({ ...base, [field]: 'a'.repeat(maxLength) }).error).toBeUndefined();
      });

      test(`rejects ${maxLength + 1} characters`, () => {
        expect(schema.validate({ ...base, [field]: 'a'.repeat(maxLength + 1) }).error).toBeDefined();
      });

      test(`${allowsEmpty ? 'allows' : 'rejects'} an empty string`, () => {
        const { error } = schema.validate({ ...base, [field]: '' });
        expect(error === undefined).toBe(allowsEmpty);
      });
    });

    describe.each([
      ['clientSchema', clientSchema, { name: 'Client' }],
      ['updateClientSchema', updateClientSchema, {}]
    ])('%s.email', (label, schema, base) => {
      test('trims surrounding whitespace before validating', () => {
        const { error, value } = schema.validate({ ...base, email: '  a@b.co  ' });
        expect(error).toBeUndefined();
        expect(value.email).toBe('a@b.co');
      });

      test('accepts an empty string', () => {
        expect(schema.validate({ ...base, email: '' }).error).toBeUndefined();
      });

      test('rejects an invalid email', () => {
        expect(schema.validate({ ...base, email: 'not-an-email' }).error).toBeDefined();
      });

      test('accepts a short valid email', () => {
        // email() already caps addresses at 254 chars, so max(255) is never the binding limit.
        expect(schema.validate({ ...base, email: 'billing@example.com' }).error).toBeUndefined();
      });
    });
  });
});
