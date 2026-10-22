const { trace } = require('@opentelemetry/api');
const { createLogger, traceMixin } = require('../../observability/logger');

describe('observability logger', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('adds valid active span identifiers to log records', () => {
    const spanContext = {
      traceId: '1234567890abcdef1234567890abcdef',
      spanId: '1234567890abcdef',
      traceFlags: 1
    };
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue({ spanContext: () => spanContext });

    expect(traceMixin()).toEqual({
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
      trace_flags: '01'
    });
  });

  test.each([
    ['no active span', undefined],
    ['invalid span context', {
      traceId: 'invalid',
      spanId: 'invalid',
      traceFlags: 0
    }]
  ])('omits trace identifiers for %s', (_description, spanContext) => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(
      spanContext ? { spanContext: () => spanContext } : undefined
    );

    expect(traceMixin()).toEqual({});
  });

  test('creates child loggers with a module binding', () => {
    expect(createLogger('routes/example').bindings()).toEqual(
      expect.objectContaining({ module: 'routes/example' })
    );
  });
});
