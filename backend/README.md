# Time Tracking Backend API

A Node.js/Express backend API for employee time tracking application with SQLite in-memory database.

## Features

- **User Authentication**: Simple email-based authentication
- **Client Management**: CRUD operations for clients
- **Work Entry Management**: Track hourly work for different clients
- **Reporting**: Generate and export reports in CSV/PDF formats
- **Data Validation**: Input validation using Joi
- **Security**: Rate limiting, CORS, and security headers

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login with email
- `GET /api/auth/me` - Get current user info

### Clients
- `GET /api/clients` - Get all clients for authenticated user
- `POST /api/clients` - Create new client
- `GET /api/clients/:id` - Get specific client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

### Work Entries
- `GET /api/work-entries` - Get all work entries (with optional client filter)
- `POST /api/work-entries` - Create new work entry
- `GET /api/work-entries/:id` - Get specific work entry
- `PUT /api/work-entries/:id` - Update work entry
- `DELETE /api/work-entries/:id` - Delete work entry

### Reports
- `GET /api/reports/client/:clientId` - Get hourly report for specific client
- `GET /api/reports/export/csv/:clientId` - Export client report as CSV
- `GET /api/reports/export/pdf/:clientId` - Export client report as PDF

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Start the development server:
```bash
npm run dev
```

4. For production:
```bash
npm start
```

## Authentication

The API uses simple email-based authentication. Include the user's email in the `x-user-email` header for all authenticated requests.

Example:
```
x-user-email: user@company.com
```

## Database Schema

### Users
- `email` (TEXT, PRIMARY KEY)
- `created_at` (DATETIME)

### Clients
- `id` (INTEGER, PRIMARY KEY)
- `name` (TEXT, NOT NULL)
- `description` (TEXT)
- `user_email` (TEXT, FOREIGN KEY)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### Work Entries
- `id` (INTEGER, PRIMARY KEY)
- `client_id` (INTEGER, FOREIGN KEY)
- `user_email` (TEXT, FOREIGN KEY)
- `hours` (DECIMAL)
- `description` (TEXT)
- `date` (DATE)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

## Development

- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (when implemented)
- `npm start` - Start production server

## Health Check

The API includes a health check endpoint at `/health` that returns server status and timestamp.

## Observability

### Structured logging

All logs are emitted as JSON lines via [Winston](https://github.com/winstonjs/winston) with `timestamp`,
`level`, `message`, `service: "timesheet-backend"` and, when available, `requestId`. Errors are passed
as `{ err }` metadata so the stack trace is captured. Every HTTP request produces an access log entry
with `method`, `url`, `status`, `responseTimeMs` and `requestId`.

- `LOG_LEVEL` – Winston log level (`error`, `warn`, `info`, `debug`, ...). Defaults to `info`;
  automatically `silent` under Jest unless set explicitly.

### Correlation IDs (`x-request-id`)

Each request is assigned a correlation ID. If the client sends an `x-request-id` header it is reused,
otherwise a UUID is generated. The ID is:

- echoed back on the response as the `x-request-id` header,
- available in handlers as `req.requestId`,
- automatically attached to every log line written while handling the request (via `AsyncLocalStorage`).

### Prometheus metrics

`GET /metrics` (unauthenticated, like `/health`) exposes Prometheus metrics via `prom-client`:

- default Node.js/process metrics (`process_*`, `nodejs_*`)
- `http_requests_total{method,route,status_code}`
- `http_request_duration_seconds{method,route,status_code}` (histogram)
- `http_request_errors_total{method,route,status_code}` for 4xx/5xx responses

The `route` label is the matched Express route pattern (e.g. `/api/clients/:id`), not the raw URL.

### Distributed tracing (OpenTelemetry)

`npm start` and `npm run dev` preload `src/tracing.js` (`node -r ./src/tracing.js src/server.js`), which
starts the OpenTelemetry Node SDK with auto-instrumentation for HTTP and Express and exports spans over
OTLP/HTTP. Tracing is skipped under Jest and fails gracefully when no collector is reachable.

- `OTEL_EXPORTER_OTLP_ENDPOINT` – collector base URL; traces are sent to `<endpoint>/v1/traces`.
  Defaults to `http://localhost:4318`.
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` – full traces URL, overrides the above.
- `OTEL_SDK_DISABLED=true` – disable tracing entirely.
- `OTEL_LOG_LEVEL` – `none` (default), `error`, `warn`, `info` or `debug` for SDK diagnostics.
