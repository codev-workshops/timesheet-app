# Production Deployment Guide

## ⚠️ Important Security & Data Considerations

### Data Persistence Warning
**This application uses SQLite in-memory database as specified in requirements.** 
- All data will be lost when the server restarts
- Not suitable for production use without modification
- For production, consider switching to file-based SQLite or a proper database

### Authentication Security
- Email-only authentication assumes trusted network environment
- No password protection - anyone with a valid company email can access
- Consider integrating with company SSO for production use
- JWT tokens expire after 24 hours

## Environment Configuration

1. **Copy environment variables:**
```bash
cp .env.example .env
```

2. **Set strong JWT secret:**
```bash
# Generate a secure random secret (32+ characters recommended)
JWT_SECRET=$(openssl rand -base64 32)
```

3. **Update .env file:**
```bash
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-frontend-domain.com
JWT_SECRET=your-generated-secret-key-here
```

## Production Deployment Steps

### Option 1: Simple PM2 Deployment
```bash
# Install PM2 globally
npm install -g pm2

# Install dependencies
npm install --production

# Start with PM2
pm2 start src/server.js --name "time-tracker-api"

# Save PM2 configuration
pm2 save
pm2 startup
```

### Option 2: Docker Deployment
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

EXPOSE 3001

CMD ["node", "src/server.js"]
```

### Option 3: Systemd Service
Create `/etc/systemd/system/time-tracker.service`:
```ini
[Unit]
Description=Time Tracker API
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/path/to/app
ExecStart=/usr/bin/node src/server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Security Hardening

1. **Use HTTPS in production**
2. **Set up proper CORS for your domain**
3. **Consider rate limiting adjustments**
4. **Monitor for unusual authentication patterns**
5. **Regular security updates for dependencies**

## Monitoring & Logging

### Structured logging (Winston)
- All logs are emitted to stdout as JSON via Winston (`src/config/logger.js`); ship them with your platform's log collector (Docker/PM2/journald) rather than writing files.
- Log level is controlled by `LOG_LEVEL` (default `info`; use `debug` for verbose output).
- Every request gets a correlation ID: the incoming `X-Request-Id` header is honoured, otherwise a UUID is generated. It is returned in the `X-Request-Id` response header and included as `requestId` in every log line for that request (`req.log`).
- Each HTTP request is logged once on completion with `method`, `route` (Express route template), `path`, `status` and `durationMs`. 4xx are logged at `warn`, 5xx at `error`.
- Errors are logged as structured fields (`err.message`, `err.code`, `err.stack`) instead of free-form console output.
- When tracing is enabled, `trace_id` and `span_id` are injected into log lines automatically for log/trace correlation.

### Metrics (Prometheus)
- `GET /metrics` exposes a Prometheus text exposition (`src/config/metrics.js`), including Node default metrics (CPU, memory, event loop lag, GC) plus:
  - `http_requests_total{method,route,status_code}` — request counter
  - `http_request_duration_seconds{method,route,status_code}` — latency histogram (`/health` and `/metrics` are excluded)
- Labels use the route template (e.g. `/api/work-entries/:id`), not the raw path, to keep cardinality bounded.
- Error rate is derived from the counter, e.g.
  `sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))`
- Restrict `/metrics` to your monitoring network (reverse proxy / firewall); it is unauthenticated.

### Distributed tracing (OpenTelemetry)
- `src/tracing.js` is loaded first in `server.js` and configures the OpenTelemetry NodeSDK with HTTP and Express auto-instrumentation and an OTLP/HTTP trace exporter.
- Tracing is enabled only when `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g. `http://otel-collector:4318`) or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set; leave them unset (or set `OTEL_SDK_DISABLED=true`) to run without tracing.
- Service name defaults to `timesheet-app-backend` and can be overridden with `OTEL_SERVICE_NAME`.
- The request correlation ID is attached to the active span as the `request_id` attribute.

### Health
- Monitor server health via `/health` endpoint (also used by the Docker `HEALTHCHECK`).

Example environment for full observability:
```bash
LOG_LEVEL=info
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=timesheet-app-backend
```

## Scaling Considerations

- In-memory database cannot be scaled horizontally
- Consider load balancer for multiple frontend instances
- Database persistence required for horizontal scaling

## Backup Strategy

**Not applicable for in-memory database** - data is ephemeral.
For production with persistent storage, implement regular database backups.
