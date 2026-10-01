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

### Admin (scheduler)
- `POST /api/admin/categorize` - Categorize pending work entries. Authenticated with the `X-Scheduler-Key` header (matched against `SCHEDULER_API_KEY`), not user auth. Query params: `userEmail`, `date` (YYYY-MM-DD), `dryRun=true`, `retryFailed=true`, `limit`. Returns `{processed, categorized, failed, skipped}`; `409` if a run is already in progress.

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
- `category_id` (INTEGER, FOREIGN KEY -> categories)
- `categorization_status` (TEXT: pending | done | failed, default pending)
- `categorization_source` (TEXT: llm | manual | seed)
- `categorized_at` (DATETIME)
- `categorization_model` (TEXT)
- `prompt_version` (TEXT)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### Categories
- `id` (INTEGER, PRIMARY KEY)
- `name` (TEXT, UNIQUE): development, meetings, design, testing, documentation, research, support, admin, uncategorized
- `description` (TEXT)

## Persistence

`DB_FILE` selects the SQLite database. Unset (tests/dev) it defaults to `:memory:`; set a file path in staging/prod (e.g. `DB_FILE=./data/timesheet.db`).

## Categorization

Entries are categorized by a pluggable provider chosen via env vars only: `LLM_PROVIDER` (`mock` | `openai` | `anthropic`), `LLM_API_KEY`, `LLM_MODEL` (optional: `LLM_BASE_URL`, `LLM_BATCH_SIZE`, `LLM_RATE_LIMIT_RPM`, `LLM_TIMEOUT_MS`). Blank descriptions resolve to `uncategorized` without calling the provider. Runs only pick up `pending` entries, so they are safe to re-run.

```bash
# Seed ~100 synthetic entries, preview the backfill, then apply it
DB_FILE=./data/timesheet.db npm run seed:test-data -- --reset
DB_FILE=./data/timesheet.db LLM_PROVIDER=mock npm run categorize:backfill -- --dry-run
DB_FILE=./data/timesheet.db LLM_PROVIDER=mock npm run categorize:backfill

# Scheduler trigger
curl -X POST -H "X-Scheduler-Key: $SCHEDULER_API_KEY" "http://localhost:3001/api/admin/categorize?dryRun=true"
```

## Development

- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm start` - Start production server

## Health Check

The API includes a health check endpoint at `/health` that returns server status and timestamp.
