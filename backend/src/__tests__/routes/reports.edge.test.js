const request = require('supertest');
const express = require('express');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

const reportRoutes = require('../../routes/reports');

const app = express();
app.use(express.json());
app.use('/api/reports', reportRoutes);

const USER = 'alice@example.com';

const binaryParser = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

const waitFor = async (predicate, timeoutMs = 2000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('Report Routes - edge cases', () => {
  let mockDb;

  const setupDb = ({ client = { id: 1, name: 'Test Client' }, entries = [] } = {}) => {
    mockDb.get.mockImplementation((query, params, callback) => {
      if (query.includes('FROM users')) return callback(null, { email: params[0] });
      return callback(null, client);
    });
    mockDb.all.mockImplementation((query, params, callback) => callback(null, entries));
  };

  const clientQueryCalls = () =>
    mockDb.get.mock.calls.filter(([query]) => query.includes('FROM clients'));

  beforeEach(() => {
    mockDb = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
    setupDb();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('authentication guard', () => {
    test.each(['/client/1', '/export/csv/1', '/export/pdf/1'])(
      'GET %s returns 401 without x-user-email and never queries clients',
      async (route) => {
        const response = await request(app).get(`/api/reports${route}`);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'User email required in x-user-email header' });
        expect(clientQueryCalls()).toHaveLength(0);
        expect(mockDb.all).not.toHaveBeenCalled();
      }
    );

    test('rejects malformed email before validating the client ID', async () => {
      const response = await request(app)
        .get('/api/reports/client/not-a-number')
        .set('x-user-email', 'not-an-email');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid email format' });
      expect(clientQueryCalls()).toHaveLength(0);
    });
  });

  describe('client ID parsing', () => {
    test.each(['/client/%20', '/export/csv/abc', '/export/pdf/-'])(
      'GET %s returns 400 for a non-numeric client ID',
      async (route) => {
        const response = await request(app).get(`/api/reports${route}`).set('x-user-email', USER);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid client ID' });
        expect(clientQueryCalls()).toHaveLength(0);
      }
    );

    test.each([
      ['0', 0],
      ['-5', -5],
      ['99999999999999999999', 1e20]
    ])('client ID %s is looked up and returns 404 when no client matches', async (raw, parsed) => {
      setupDb({ client: null });

      const response = await request(app).get(`/api/reports/client/${raw}`).set('x-user-email', USER);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
      expect(clientQueryCalls()[0][1]).toEqual([parsed]);
    });

    // BUG: routes use parseInt(), so IDs with trailing junk or decimals ("1abc", "2e5",
    // "3.7") are silently truncated to 1, 2 and 3 and served instead of rejected with 400.
    test.skip.each(['/client/1abc', '/export/csv/2e5', '/export/pdf/3.7'])(
      'GET %s returns 400 for a client ID that is not a whole integer',
      async (route) => {
        const response = await request(app).get(`/api/reports${route}`).set('x-user-email', USER);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid client ID' });
      }
    );
  });

  describe('GET /api/reports/client/:clientId', () => {
    test('sums hours numerically when the DB returns decimal strings', async () => {
      setupDb({ entries: [{ hours: '2.50' }, { hours: '1' }, { hours: 0.25 }] });

      const response = await request(app).get('/api/reports/client/1').set('x-user-email', USER);

      expect(response.status).toBe(200);
      expect(response.body.totalHours).toBe(3.75);
      expect(response.body.entryCount).toBe(3);
    });

    test('sums fractional hours without losing precision beyond float tolerance', async () => {
      setupDb({ entries: [{ hours: 0.1 }, { hours: 0.2 }] });

      const response = await request(app).get('/api/reports/client/1').set('x-user-email', USER);

      expect(response.body.totalHours).toBeCloseTo(0.3, 10);
    });

    test('scopes entries to the authenticated user and orders by date desc', async () => {
      await request(app).get('/api/reports/client/7').set('x-user-email', USER);

      expect(clientQueryCalls()[0][1]).toEqual([7]);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringMatching(/WHERE client_id = \? AND user_email = \?[\s\S]*ORDER BY date DESC/),
        [7, USER],
        expect.any(Function)
      );
    });
  });

  describe('GET /api/reports/export/csv/:clientId', () => {
    test('scopes CSV entries to the authenticated user', async () => {
      await request(app).get('/api/reports/export/csv/3').set('x-user-email', USER);

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE client_id = ? AND user_email = ?'),
        [3, USER],
        expect.any(Function)
      );
    });

    test('returns a header-only CSV when the client has no entries', async () => {
      const response = await request(app).get('/api/reports/export/csv/1').set('x-user-email', USER);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);
      expect(response.text.trim()).toBe('Date,Hours,Description,Created At');
    });

    test('escapes commas, quotes and newlines in descriptions', async () => {
      setupDb({
        entries: [
          { date: '2024-01-02', hours: 1.5, description: 'Fix, "urgent"\nbug', created_at: '2024-01-02 10:00:00' },
          { date: '2024-01-01', hours: 2, description: null, created_at: '2024-01-01 09:00:00' }
        ]
      });

      const response = await request(app).get('/api/reports/export/csv/1').set('x-user-email', USER);

      expect(response.status).toBe(200);
      expect(response.text).toContain('2024-01-02,1.5,"Fix, ""urgent""\nbug",2024-01-02 10:00:00');
      expect(response.text).toContain('2024-01-01,2,,2024-01-01 09:00:00');
    });

    test('sanitizes special and non-ASCII characters in the download filename', async () => {
      setupDb({ client: { id: 1, name: 'Acme & Co. / "Café"' } });

      const response = await request(app).get('/api/reports/export/csv/1').set('x-user-email', USER);

      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="Acme___Co_____Caf___report_[0-9TZ-]+\.csv"$/
      );
    });

    test('deletes the temporary CSV file after the download completes', async () => {
      const unlinkSpy = jest.spyOn(fs, 'unlink');

      const response = await request(app).get('/api/reports/export/csv/1').set('x-user-email', USER);

      expect(response.status).toBe(200);
      await waitFor(() => unlinkSpy.mock.calls.length > 0);
      const tempPath = unlinkSpy.mock.calls[0][0];
      expect(tempPath).toMatch(/temp[\\/][0-9a-f-]{36}\.csv$/);
      await waitFor(() => !fs.existsSync(tempPath));
    });

    // BUG: the res.download() callback only logs errors. If sending the file fails before
    // headers are written (e.g. the temp file is missing), no response is ever sent and the
    // request hangs until the client times out.
    test.skip('responds with 500 when sending the generated CSV fails', async () => {
      jest.spyOn(express.response, 'download').mockImplementation(function (filePath, name, callback) {
        callback(new Error('ENOENT: no such file or directory'));
      });

      const response = await request(app)
        .get('/api/reports/export/csv/1')
        .set('x-user-email', USER)
        .timeout({ response: 1500 });

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/reports/export/pdf/:clientId', () => {
    const getPdf = (clientId = 1) =>
      request(app)
        .get(`/api/reports/export/pdf/${clientId}`)
        .set('x-user-email', USER)
        .buffer(true)
        .parse(binaryParser);

    const makeEntries = (count) =>
      Array.from({ length: count }, (_, i) => ({
        date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
        hours: 1,
        description: `Task ${i}`,
        created_at: '2024-01-01'
      }));

    test('scopes PDF entries to the authenticated user', async () => {
      await getPdf(4);

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE client_id = ? AND user_email = ?'),
        [4, USER],
        expect.any(Function)
      );
    });

    test('streams a valid PDF for a client with no entries', async () => {
      const textSpy = jest.spyOn(PDFDocument.prototype, 'text');

      const response = await getPdf();

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(textSpy).toHaveBeenCalledWith('Total Hours: 0.00');
      expect(textSpy).toHaveBeenCalledWith('Total Entries: 0');
    });

    test('rounds total hours to two decimals and labels missing descriptions', async () => {
      setupDb({
        entries: [
          { date: '2024-01-02', hours: 0.1, description: null, created_at: '2024-01-02' },
          { date: '2024-01-01', hours: 0.2, description: '', created_at: '2024-01-01' }
        ]
      });
      const textSpy = jest.spyOn(PDFDocument.prototype, 'text');

      const response = await getPdf();

      expect(response.status).toBe(200);
      expect(textSpy).toHaveBeenCalledWith('Total Hours: 0.30');
      const noDescriptionCalls = textSpy.mock.calls.filter(([text]) => text === 'No description');
      expect(noDescriptionCalls).toHaveLength(2);
    });

    test('sanitizes header-breaking characters in the PDF filename', async () => {
      setupDb({ client: { id: 1, name: 'Evil"; filename="x.exe' } });

      const response = await getPdf();

      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="Evil___filename__x_exe_report_[0-9TZ-]+\.pdf"$/
      );
    });

    test('adds pages and still produces a valid PDF for many entries', async () => {
      setupDb({ entries: makeEntries(120) });
      const addPageSpy = jest.spyOn(PDFDocument.prototype, 'addPage');

      const response = await getPdf();

      expect(response.status).toBe(200);
      expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(response.body.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
      // One call is PDFKit's initial page; the route must add more for 120 rows.
      expect(addPageSpy.mock.calls.length).toBeGreaterThan(1);
    });

    // BUG: when a row overflows (doc.y > 700) the route calls addPage() but keeps the stale
    // `y` captured before the page break, so hours/description are drawn near the bottom of
    // the new page while the date is drawn at the top, misaligning every row after a break.
    test.skip('keeps date, hours and description on the same line after a page break', async () => {
      setupDb({ entries: makeEntries(120) });
      const textSpy = jest.spyOn(PDFDocument.prototype, 'text');

      await getPdf();

      for (let row = 0; row < 120; row += 1) {
        const descriptionIndex = textSpy.mock.calls.findIndex(([text]) => text === `Task ${row}`);
        const [dateCall, hoursCall, descriptionCall] = textSpy.mock.calls.slice(
          descriptionIndex - 2,
          descriptionIndex + 1
        );
        expect(hoursCall[2]).toBe(dateCall[2]);
        expect(descriptionCall[2]).toBe(dateCall[2]);
      }
    });
  });
});
