# Employee Time Tracking Application

A full-stack web application for tracking and reporting employee hourly work across different clients.

## ⚠️ Important Notes

### Data Persistence
**This application uses SQLite in-memory database as specified in requirements.**
- ⚠️ **All data is lost when the backend server restarts**
- Suitable for development and testing
- For production use, modify `backend/src/database/init.js` to use file-based SQLite instead of `:memory:`

### Authentication
- Email-only authentication with JWT tokens
- No password required - assumes trusted internal network
- Anyone with a valid email can create an account and log in
- Consider integrating with company SSO for production use

## Features

- ✅ User authentication (email-based with JWT tokens)
- ✅ Add, edit, and delete clients
- ✅ Add, edit, and delete hourly work entries for each client
- ✅ View hourly reports for each client
- ✅ Export hourly reports to CSV or PDF
- ✅ Manager team reports (per-period summary, by-project rollup, per-employee drill-down, CSV/PDF export)

## Tech Stack

### Frontend
- **React** with TypeScript
- **Vite** for build tooling
- **Material UI** for components
- **React Query** for server state management
- **React Router** for navigation
- **Axios** for API calls

### Backend
- **Node.js** with Express
- **SQLite** in-memory database
- **JWT** for authentication
- **Joi** for validation
- **PDFKit** for PDF generation
- **csv-writer** for CSV export

## Project Structure

```
.
├── backend/
│   ├── src/
│   │   ├── database/
│   │   │   └── init.js           # Database initialization
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT authentication
│   │   │   └── errorHandler.js  # Error handling
│   │   ├── routes/
│   │   │   ├── auth.js           # Authentication endpoints
│   │   │   ├── clients.js        # Client CRUD
│   │   │   ├── workEntries.js    # Work entry CRUD
│   │   │   └── reports.js        # Reporting & export
│   │   ├── validation/
│   │   │   └── schemas.js        # Joi validation schemas
│   │   └── server.js             # Express server
│   ├── package.json
│   └── DEPLOYMENT.md             # Production deployment guide
│
└── frontend/
    ├── src/
    │   ├── api/
    │   │   └── client.ts         # API client with JWT
    │   ├── components/
    │   │   └── Layout.tsx        # Main layout
    │   ├── contexts/
    │   │   └── AuthContext.tsx   # Auth state management
    │   ├── pages/
    │   │   ├── LoginPage.tsx     # Login page
    │   │   ├── DashboardPage.tsx # Dashboard
    │   │   ├── ClientsPage.tsx   # Client management
    │   │   ├── WorkEntriesPage.tsx # Work entry management
    │   │   └── ReportsPage.tsx   # Reports & exports
    │   ├── types/
    │   │   └── api.ts            # TypeScript interfaces
    │   └── App.tsx               # Main app component
    └── package.json
```

## Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```bash
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
JWT_SECRET=your-secure-secret-key-change-this
```

5. Start the development server:
```bash
npm run dev
```

Backend will be running at `http://localhost:3001`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Update `.env`:
```bash
VITE_API_URL=http://localhost:3001
```

5. Start the development server:
```bash
npm run dev
```

Frontend will be running at `http://localhost:5173`

## Usage

1. Open `http://localhost:5173` in your browser
2. Enter any email address to log in (no password required)
3. Start adding clients and tracking work hours
4. View reports and export data as CSV or PDF

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email, returns JWT token
- `GET /api/auth/me` - Get current user info (requires auth)

### Clients
- `GET /api/clients` - Get all clients
- `POST /api/clients` - Create new client
- `GET /api/clients/:id` - Get specific client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

### Work Entries
- `GET /api/work-entries` - Get all work entries (optional ?clientId filter)
- `POST /api/work-entries` - Create new work entry
- `GET /api/work-entries/:id` - Get specific work entry
- `PUT /api/work-entries/:id` - Update work entry
- `DELETE /api/work-entries/:id` - Delete work entry

### Reports
- `GET /api/reports/client/:clientId` - Get hourly report for client
- `GET /api/reports/export/csv/:clientId` - Export report as CSV
- `GET /api/reports/export/pdf/:clientId` - Export report as PDF

All authenticated endpoints require `Authorization: Bearer <token>` header.

### Team Reports (managers)

Managers are defined by the `manager_employees` table:

| Column | Type | Notes |
|--------|------|-------|
| `manager_email` | TEXT, FK → `users.email` | Part of the primary key |
| `employee_email` | TEXT, FK → `users.email` | Part of the primary key |
| `created_at` | DATETIME | Defaults to `CURRENT_TIMESTAMP` |

Indexed by `idx_manager_employees_manager (manager_email)`. All team endpoints sit behind
`authenticateUser` + `requireManager` (`backend/src/middleware/managerAuth.js`): a caller who manages
nobody gets `403 { "error": "Manager access required" }`, and results only ever include the caller's
mapped employees.

| Endpoint | Query params | Response |
|----------|--------------|----------|
| `GET /api/reports/team/employees` | – | `{ employees: [{ email }] }` |
| `GET /api/reports/team/summary` | `start_date`, `end_date`, `group_by` (`week` default \| `month`) | `{ startDate, endDate, groupBy, summary: [{ employee_email, period, total_hours }] }` |
| `GET /api/reports/team/by-project` | `start_date`, `end_date` | `{ startDate, endDate, byProject: [{ client_name, employee_email, total_hours }], projectTotals: [{ client_name, total_hours }] }` |
| `GET /api/reports/team/employee/:email` | `start_date`, `end_date` | `{ employee_email, startDate, endDate, workEntries, totalHours, entryCount }` (`403` if `:email` is not managed by the caller) |
| `GET /api/reports/team/export/csv` | `start_date`, `end_date` | CSV download (`Employee, Date, Client, Hours, Description`) |
| `GET /api/reports/team/export/pdf` | `start_date`, `end_date` | PDF download (totals per employee + entry table) |

Parameter rules:
- `start_date` and `end_date` are required, must be real calendar dates in `YYYY-MM-DD` format, are
  inclusive, and `start_date` must be on or before `end_date`. Violations (and unknown query params)
  return `400 { "error": ... }`.
- `group_by` accepts only `week` or `month`; anything else returns `400`.
- **Week convention:** weekly buckets use SQLite `strftime('%Y-%W', date)` — weeks start on **Monday**,
  numbered `00`–`53`; days before the first Monday of a year fall into week `00`. Monthly buckets use
  `strftime('%Y-%m', date)`.
- By-project rollups group by client **name** (client rows are per-user), so the same client name used
  by several employees appears once per employee in `byProject` and is merged in `projectTotals`.

The frontend exposes this at `/team-reports` ("Team Reports" in the nav, shown only to users who manage
at least one employee).

#### Demo seed data

Outside `NODE_ENV=production`, `initializeDatabase()` seeds demo data (each table only when it is empty):
manager `pm@example.com` managing `emp1@example.com` and `emp2@example.com`, their clients
(`Acme Corp`, `Globex`, `Initech`) and work entries across September–October 2026, plus an unmanaged
`outsider@example.com` whose hours never appear in `pm@example.com`'s reports. Log in as
`pm@example.com` and pick a date range covering 2026-09-01 – 2026-10-31 to see them. Because the
database is in-memory, `manager_employees` and all seed data are reset on every backend restart.

## Security Features

- JWT-based authentication with 24-hour token expiration
- Rate limiting on authentication endpoints (5 attempts per 15 minutes)
- CORS protection
- Helmet security headers
- Input validation with Joi schemas
- SQL injection protection with parameterized queries

## Development

### Backend Development
```bash
cd backend
npm run dev  # Starts with nodemon for auto-reload
```

### Frontend Development
```bash
cd frontend
npm run dev  # Starts Vite dev server with HMR
```

### Running Tests

**Backend:**
```bash
cd backend
npm test                    # Run all tests
npm run test:coverage       # Run tests with coverage report
npm run test:watch          # Run tests in watch mode
```

### Test Coverage

The backend has comprehensive test coverage with **161 tests** across 8 test suites:

| File | Statements | Branches | Functions | Lines |
|------|------------|----------|-----------|-------|
| **Overall** | **90.16%** | **93.82%** | **92.18%** | **90.35%** |
| database/init.js | 100% | 100% | 100% | 100% |
| middleware/auth.js | 100% | 100% | 100% | 100% |
| middleware/errorHandler.js | 100% | 100% | 100% | 100% |
| routes/auth.js | 100% | 100% | 100% | 100% |
| routes/clients.js | 97.89% | 100% | 100% | 97.89% |
| routes/workEntries.js | 98.41% | 100% | 100% | 98.41% |
| routes/reports.js | 64.15% | 69.44% | 68.75% | 64.42% |
| validation/schemas.js | 100% | 100% | 100% | 100% |

Coverage thresholds are configured in `jest.config.js`:
- Statements: 60%
- Branches: 60%
- Functions: 65%
- Lines: 60%

### Building for Production

**Backend:**
```bash
cd backend
npm start  # Production mode
```

**Frontend:**
```bash
cd frontend
npm run build  # Creates optimized production build in dist/
npm run preview  # Preview production build
```

## Production Deployment

See `backend/DEPLOYMENT.md` for detailed production deployment instructions.

### Quick Production Checklist
- [ ] Set strong `JWT_SECRET` in environment variables
- [ ] Configure proper `FRONTEND_URL` for CORS
- [ ] Consider switching to file-based SQLite for data persistence
- [ ] Set up HTTPS/SSL certificates
- [ ] Configure proper logging and monitoring
- [ ] Set up automated backups (if using persistent storage)
- [ ] Review and adjust rate limiting settings
- [ ] Consider integrating with company SSO

## Known Limitations

1. **In-memory database** - All data is lost on server restart
2. **Email-only auth** - No password protection, assumes trusted network
3. **Minimal roles** - The only role concept is the manager → employee mapping in `manager_employees` (no admin UI to manage it)
4. **Single-server architecture** - Not designed for horizontal scaling
5. **No real-time updates** - Changes require page refresh

## Future Enhancements

- Persistent database storage
- User roles and permissions
- Multi-tenancy support
- Real-time updates with WebSockets
- Advanced reporting and analytics
- Email notifications
- Mobile app
- Integration with calendar systems

## License

MIT

## Support

For issues or questions, please contact your system administrator.
