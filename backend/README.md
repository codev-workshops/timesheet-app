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

The API uses password authentication with signed JWTs. Register or log in to obtain a token, then send it
as a bearer token on every authenticated request.

```bash
# Register (password must be at least 12 characters)
curl -X POST localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@company.com","password":"correct-horse-battery"}'

# Log in to obtain a token
curl -X POST localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@company.com","password":"correct-horse-battery"}'

# Use the token
curl localhost:3001/api/work-entries -H 'Authorization: Bearer <token>'
```

`JWT_SECRET` (at least 32 characters) must be set in the environment; the server refuses to start without
it. Tokens expire after `JWT_EXPIRES_IN` (default `24h`).

## Database Schema

### Users
- `email` (TEXT, PRIMARY KEY)
- `password_hash` (TEXT, NOT NULL) — bcrypt hash, cost factor `BCRYPT_ROUNDS` (default 12)
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
