# Dependency updates

The Lab C1 npm maintenance run refreshed both lockfiles with `npm update`.
All direct dependencies resolved to the newest versions allowed by their existing
manifest ranges. No manifest ranges or application code changed.

| Backend package | Before | After |
| --- | --- | --- |
| `cors` | 2.8.5 | 2.8.6 |
| `express` | 4.22.1 | 4.22.3 |
| `joi` | 17.13.3 | 17.13.9 |
| `jsonwebtoken` | 9.0.2 | 9.0.3 |
| `morgan` | 1.10.1 | 1.12.1 |
| `nodemon` | 3.1.11 | 3.1.14 |

| Frontend package | Before | After |
| --- | --- | --- |
| `@eslint/js` | 9.39.1 | 9.39.5 |
| `@mui/icons-material` | 7.3.6 | 7.3.11 |
| `@mui/material` | 7.3.6 | 7.3.11 |
| `@mui/x-date-pickers` | 8.19.0 | 8.29.6 |
| `@tanstack/react-query` | 5.90.11 | 5.108.4 |
| `@types/node` | 24.10.1 | 24.19.4 |
| `@types/react` | 19.2.7 | 19.3.3 |
| `@types/react-dom` | 19.2.3 | 19.3.0 |
| `@vitejs/plugin-react` | 5.1.1 | 5.2.0 |
| `axios` | 1.13.2 | 1.21.1 |
| `bootstrap` | 5.3.8 | 5.3.9 |
| `date-fns` | 4.1.0 | 4.4.0 |
| `eslint` | 9.39.1 | 9.39.5 |
| `eslint-plugin-react-hooks` | 7.0.1 | 7.1.1 |
| `eslint-plugin-react-refresh` | 0.4.24 | 0.4.26 |
| `react` | 19.2.0 | 19.3.1 |
| `react-dom` | 19.2.0 | 19.3.1 |
| `react-router-dom` | 7.10.0 | 7.18.7 |
| `typescript-eslint` | 8.48.1 | 8.74.0 |
| `vite` | 7.2.6 | 7.3.8 |

## Skipped

| Reason | Packages |
| --- | --- |
| Newer major is outside the maintenance scope | Backend: Express, Express Rate Limit, Helmet, Jest, Joi, SQLite3, Supertest. Frontend: ESLint and its JS config, MUI packages, Node types, Vite React plugin, Globals, TypeScript, Vite. |
| Newer pre-1.0 minors can break compatibility and are outside the current caret ranges | PDFKit (`^0.13.0`), ESLint React Refresh plugin (`^0.4.24`). |

## Verification

- On Node 20.20.2, all 165 backend tests passed; the frontend built and linted.
- Vite still reports a JavaScript chunk larger than 500 kB.
- `npm audit --omit=dev` went from 18 to 7 backend findings and from 6 to 0 frontend findings. npm identifies a major SQLite3 upgrade as the fix for the remaining backend production-tree findings, including the critical transitive `tar` advisory. The full frontend audit also reported zero findings.
