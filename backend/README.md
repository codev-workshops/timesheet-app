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
- `DELETE /api/clients/:id` - Delete client (409 if the client has work entries or projects)

### Projects
- `GET /api/projects` - Get all projects for authenticated user (with optional client filter)
- `POST /api/projects` - Create new project (`name`, `description?`, `clientId`)
- `GET /api/projects/:id` - Get specific project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project (409 if work entries reference it)

### Work Entries
- `GET /api/work-entries` - Get all work entries (with optional `clientId` / `projectId` filter)
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

### Projects
- `id` (INTEGER, PRIMARY KEY)
- `name` (TEXT, NOT NULL)
- `description` (TEXT)
- `client_id` (INTEGER, FOREIGN KEY -> clients.id, ON DELETE RESTRICT)
- `user_email` (TEXT, FOREIGN KEY -> users.email, ON DELETE CASCADE)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### Work Entries
- `id` (INTEGER, PRIMARY KEY)
- `client_id` (INTEGER, FOREIGN KEY -> clients.id, ON DELETE RESTRICT)
- `project_id` (INTEGER, nullable, FOREIGN KEY -> projects.id, ON DELETE RESTRICT)
- `user_email` (TEXT, FOREIGN KEY -> users.email, ON DELETE CASCADE)
- `hours` (DECIMAL(5,2))
- `rate` (DECIMAL(8,2), nullable hourly billable rate)
- `description` (TEXT)
- `date` (DATE)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

Indexes: `idx_work_entries_client_id`, `idx_work_entries_project_id`, `idx_work_entries_user_email`,
`idx_work_entries_date`, `idx_projects_client_id`, `idx_projects_user_email`.

### Migrations

`src/database/migrate.js` runs on startup for both the in-memory dev/test database and the
file-based Docker database. It tracks the schema version with `PRAGMA user_version`
(current target: `2`). For databases below the target it adds the `projects` table, the
`work_entries.project_id` / `work_entries.rate` columns (guarded by `PRAGMA table_info`),
rebuilds `work_entries` inside a transaction when its foreign keys do not match
(`client_id`/`project_id` RESTRICT, `user_email` CASCADE), recreates the indexes and then
bumps `user_version`. Deleting a client or project that still has work entries is rejected
with HTTP 409 at the application level as well, because the in-memory database does not rely
on SQLite foreign-key enforcement.

## Development

- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (when implemented)
- `npm start` - Start production server

## Health Check

The API includes a health check endpoint at `/health` that returns server status and timestamp.
