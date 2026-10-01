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

`POST /api/auth/login` with `{ "email": "user@company.com" }` returns a signed JWT (HS256, 24h expiry) in the `token` field alongside `user`. Send it on every authenticated request:

```
Authorization: Bearer <token>
```

Missing, malformed, invalid, or expired tokens return `401` with `{ "error": ... }`. The `x-user-email` header is no longer accepted.

### Environment variables

- `JWT_SECRET` (required) - HMAC secret used to sign and verify tokens. The server refuses to start if it is unset or empty. Use a long random value, e.g. `openssl rand -hex 32`. `.env.example` is a template only; the server does not load `.env` itself, so export the variable (e.g. `export JWT_SECRET=...`) or inject it via your process manager / container runtime.

## Security

- Login is still email-only (no password) in this phase: anyone who knows an email address can obtain a token for it. Tokens prevent request-level identity spoofing, not account takeover via login.
- The frontend stores the JWT in `localStorage` (`authToken` key). This is readable by any script on the page and therefore exposed to XSS; this trade-off is accepted for this phase. Moving to an `httpOnly`, `Secure`, `SameSite` cookie is the planned follow-up.
- Tokens are not revocable before expiry (24h); rotating `JWT_SECRET` invalidates all outstanding tokens.

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
