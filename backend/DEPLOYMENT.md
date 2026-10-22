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

The backend preloads `src/observability/tracing.js` with Node's `-r` option in
development, production, and Docker. The preload runs before Express and the SQLite
driver load so OpenTelemetry can instrument incoming HTTP requests; it also installs
the SQLite callback instrumentation. `npm run dev`, `npm start`, and the Docker image
all enable it by default. Set `OTEL_SDK_DISABLED=true` to disable SDK startup.

Application logs are newline-delimited structured JSON from Pino. Records include an
ISO timestamp, level, service, module, and (for HTTP request logs) `req_id`. When a
valid span is active, `trace_id`, `span_id`, and `trace_flags` are included. The
`X-Request-Id` response header always contains the request ID. A valid incoming
`X-Request-Id` is echoed; if absent, a valid `X-Correlation-Id` is used; otherwise a
UUID is generated. Incoming values must match `[A-Za-z0-9._:-]{1,128}`.

`/metrics` is served by the Express app on its normal port. It is unauthenticated;
restrict access at the network or ingress layer in production. By default the
Prometheus exporter does not start a second server. Set `PROMETHEUS_PORT` to opt into
an additional dedicated Prometheus server; `METRICS_PATH` changes the scrape path
(default `/metrics`).

`/health` is a liveness check and returns the existing `{ status: "OK", timestamp }`
payload. `/health/ready` queries SQLite and returns `200` with `status: "ready"` or
`503` with `status: "unavailable"` if the database cannot be reached.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OTEL_SERVICE_NAME` | `timesheet-backend` | Service name on telemetry resources and logs |
| `LOG_LEVEL` | `info` (`silent` in tests) | Pino log level |
| `METRICS_PATH` | `/metrics` | Express metrics scrape endpoint |
| `PROMETHEUS_PORT` | unset | Optional dedicated Prometheus exporter port |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | Configure OTLP export when a Collector is available |
| `OTEL_TRACES_EXPORTER` | unset | Select an SDK trace exporter, e.g. `otlp` or `console` |
| `OTEL_SDK_DISABLED` | unset | Set to `true` to skip OpenTelemetry SDK setup |

When no trace exporter is configured, spans are recorded for correlation but not
exported. To connect a Collector later, configure `OTEL_TRACES_EXPORTER=otlp` and
`OTEL_EXPORTER_OTLP_ENDPOINT` for its endpoint.

Example Prometheus scrape job:

```yaml
scrape_configs:
  - job_name: timesheet-backend
    scrape_interval: 15s
    metrics_path: /metrics
    static_configs:
      - targets: ["app:3001"]
```

Add application telemetry through the shared module:

```js
const { meter, tracer } = require('./observability');
meter.createCounter('timesheet_entries_created_total').add(1);
tracer.startSpan('timesheet.createEntry').end();
```

## Scaling Considerations

- In-memory database cannot be scaled horizontally
- Consider load balancer for multiple frontend instances
- Database persistence required for horizontal scaling

## Backup Strategy

**Not applicable for in-memory database** - data is ephemeral.
For production with persistent storage, implement regular database backups.
