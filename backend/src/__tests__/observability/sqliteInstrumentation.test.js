const {
  SpanStatusCode,
  trace
} = require('@opentelemetry/api');
const { tracing } = require('@opentelemetry/sdk-node');
const { instrumentSqlite3 } = require('../../observability/sqliteInstrumentation');

let exporter;
let provider;

class FakeDatabase {
  execute(...args) {
    const callback = args.at(-1);
    if (typeof callback === 'function') callback.call(this, this.error || null);
    return this;
  }

  run(...args) {
    return this.execute(...args);
  }

  get(...args) {
    return this.execute(...args);
  }

  all(...args) {
    return this.execute(...args);
  }

  exec(...args) {
    return this.execute(...args);
  }
}

beforeAll(() => {
  exporter = new tracing.InMemorySpanExporter();
  provider = new tracing.BasicTracerProvider({
    spanProcessors: [new tracing.SimpleSpanProcessor(exporter)]
  });
  trace.setGlobalTracerProvider(provider);
});

afterEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
  trace.disable();
});

describe('SQLite instrumentation', () => {
  test('records a parameter-free client span and preserves callback this', () => {
    instrumentSqlite3({ Database: FakeDatabase });
    const database = new FakeDatabase();
    let callbackThis;

    database.run(
      'UPDATE clients SET name = ? WHERE id = ?',
      ['private name', 23],
      function callback(err) {
        expect(err).toBeNull();
        callbackThis = this;
      }
    );

    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe('sqlite.run');
    expect(span.kind).toBe(2);
    expect(span.attributes).toEqual({
      'db.system.name': 'sqlite',
      'db.operation.name': 'UPDATE',
      'db.query.text': 'UPDATE clients SET name = ? WHERE id = ?'
    });
    expect(JSON.stringify(span.attributes)).not.toContain('private name');
    expect(callbackThis).toBe(database);
  });

  test('records errors and ends the span', () => {
    instrumentSqlite3({ Database: FakeDatabase });
    const database = new FakeDatabase();
    const failure = new Error('database failed');
    database.error = failure;

    database.get('SELECT * FROM clients WHERE id = ?', [1], (err) => {
      expect(err).toBe(failure);
    });

    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events[0].name).toBe('exception');
  });

  test('passes calls without callbacks through without creating spans', () => {
    instrumentSqlite3({ Database: FakeDatabase });
    const database = new FakeDatabase();

    expect(database.run('DELETE FROM clients WHERE id = ?', ['private value'])).toBe(database);
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });

  test('patching is idempotent', () => {
    instrumentSqlite3({ Database: FakeDatabase });
    const patchedRun = FakeDatabase.prototype.run;

    instrumentSqlite3({ Database: FakeDatabase });

    expect(FakeDatabase.prototype.run).toBe(patchedRun);
  });
});
