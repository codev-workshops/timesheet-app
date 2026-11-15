---
description: SQL safety rules for backend routes
trigger: glob
globs: "backend/src/routes/**"
---

Never interpolate values into SQL strings. Use `?` placeholders. Always include `user_email = ?` in WHERE clauses on `work_entries` so time data stays isolated per user. The `clients` table is shared across all users and must not be filtered by user.
