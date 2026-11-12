# Software Bill of Materials & License Compliance Report — timesheet-app

| | |
|---|---|
| Generated | 2026-11-12 |
| Repository | `codev-workshops/timesheet-app` (`main` @ `03bedf3`) |
| SBOM format | CycloneDX 1.7 (JSON) |
| SBOM files | [`sbom-backend.json`](./sbom-backend.json), [`sbom-frontend.json`](./sbom-frontend.json) |
| Tools | `@cyclonedx/cdxgen` 12.9.1 (`-t js`), `license-checker-rseidelsohn` 4.4.2, npm 10.9.0 / Node 22.12.0 on scan host; `docker` for base-image inspection |

## 1. Summary

| Manifest | Packages in resolved tree | Direct | Runtime scope¹ | Dev-only | Listed in lockfile but not installed on scan host² | npm-level copyleft |
|---|---|---|---|---|---|---|
| `backend/` | 543 | 13 | 273 | 270 | 1 | **None** |
| `frontend/` | 311 | 24 | 116 | 195 | 46 | **None** |

¹ Runtime = installed by `npm ci --omit=dev` (includes optional deps). For the frontend, "runtime" means *bundled into the Vite build shipped to browsers*; frontend dev deps are build-time only and are not in the Docker production image.  
² Platform-specific optional binaries (e.g. `fsevents`, `@esbuild/*`, `@rollup/rollup-*` for non-linux-x64 targets). They are in the lockfile and the SBOM; their licenses come from the lockfile/SBOM metadata (all MIT).

> This report is an engineering assessment, not legal advice. Have counsel confirm before external distribution.

**Verdict:** no GPL / LGPL / AGPL / MPL / EPL / CC-BY-SA / SSPL licensed packages exist anywhere in the npm dependency trees (runtime or dev). Every npm package is under a permissive license (MIT, ISC, BSD, Apache-2.0, 0BSD) or a permissive/attribution data license that is dev-only. Copyleft components show up **only at the container level** (Alpine OS packages in `node:20-alpine`, §4.3). Those are separate programs aggregated in the image and are not linked into the application.

### Key findings

1. **Lockfiles are committed**, contrary to the task brief: `backend/package-lock.json` and `frontend/package-lock.json` (lockfileVersion 3) are tracked in git. `npm install` reported `up to date` for both and left the lockfiles unchanged, so the SBOMs reflect the committed lockfiles exactly (§5).
2. **`node:20-alpine` is end-of-life.** Node.js 20 ("Iron") reached end-of-life on 2026-04-30. The image resolved during this scan (Node v20.20.2, created 2026-04-15) will get no more security fixes. Move to `node:22-alpine` or `node:24-alpine` (§4.3).
3. **`sqlite3` ships native code** (a compiled N-API addon plus the bundled SQLite C library). Its licenses are fine (BSD-3-Clause / public domain), but the `.node` binary is fetched or compiled at install time and the SBOM records it only as the npm package (§4.1).
4. **MUI X is Community (MIT) only.** No Pro/Premium packages or license key are in use (§4.2).

## 2. Direct dependencies (declared range → resolved version)

### `backend/package.json`

| Package | Declared range | Resolved | License | Scope |
|---|---|---|---|---|
| `cors` | `^2.8.5` | `2.8.5` | MIT | runtime |
| `csv-writer` | `^1.6.0` | `1.6.0` | MIT | runtime |
| `express` | `^4.18.2` | `4.22.1` | MIT | runtime |
| `express-rate-limit` | `^7.1.5` | `7.5.1` | MIT | runtime |
| `helmet` | `^7.1.0` | `7.2.0` | MIT | runtime |
| `joi` | `^17.11.0` | `17.13.3` | BSD-3-Clause | runtime |
| `jsonwebtoken` | `^9.0.2` | `9.0.2` | MIT | runtime |
| `morgan` | `^1.10.0` | `1.10.1` | MIT | runtime |
| `pdfkit` | `^0.13.0` | `0.13.0` | MIT | runtime |
| `sqlite3` | `^5.1.6` | `5.1.7` | BSD-3-Clause | runtime |
| `jest` | `^29.7.0` | `29.7.0` | MIT | dev |
| `nodemon` | `^3.0.2` | `3.1.11` | MIT | dev |
| `supertest` | `^6.3.3` | `6.3.4` | MIT | dev |

### `frontend/package.json`

| Package | Declared range | Resolved | License | Scope |
|---|---|---|---|---|
| `@emotion/react` | `^11.14.0` | `11.14.0` | MIT | runtime |
| `@emotion/styled` | `^11.14.1` | `11.14.1` | MIT | runtime |
| `@mui/icons-material` | `^7.3.6` | `7.3.6` | MIT | runtime |
| `@mui/material` | `^7.3.6` | `7.3.6` | MIT | runtime |
| `@mui/x-date-pickers` | `^8.19.0` | `8.19.0` | MIT | runtime |
| `@tanstack/react-query` | `^5.90.11` | `5.90.11` | MIT | runtime |
| `axios` | `^1.13.2` | `1.13.2` | MIT | runtime |
| `bootstrap` | `^5.3.8` | `5.3.8` | MIT | runtime |
| `date-fns` | `^4.1.0` | `4.1.0` | MIT | runtime |
| `react` | `^19.2.0` | `19.2.0` | MIT | runtime |
| `react-dom` | `^19.2.0` | `19.2.0` | MIT | runtime |
| `react-router-dom` | `^7.10.0` | `7.10.0` | MIT | runtime |
| `@eslint/js` | `^9.39.1` | `9.39.1` | MIT | dev |
| `@types/node` | `^24.10.1` | `24.10.1` | MIT | dev |
| `@types/react` | `^19.2.5` | `19.2.7` | MIT | dev |
| `@types/react-dom` | `^19.2.3` | `19.2.3` | MIT | dev |
| `@vitejs/plugin-react` | `^5.1.1` | `5.1.1` | MIT | dev |
| `eslint` | `^9.39.1` | `9.39.1` | MIT | dev |
| `eslint-plugin-react-hooks` | `^7.0.1` | `7.0.1` | MIT | dev |
| `eslint-plugin-react-refresh` | `^0.4.24` | `0.4.24` | MIT | dev |
| `globals` | `^16.5.0` | `16.5.0` | MIT | dev |
| `typescript` | `~5.9.3` | `5.9.3` | Apache-2.0 | dev |
| `typescript-eslint` | `^8.46.4` | `8.48.1` | MIT | dev |
| `vite` | `^7.2.4` | `7.2.6` | MIT | dev |

## 3. License distribution (full transitive tree)

### `backend/`

| License (SPDX) | Runtime | Dev-only | Total |
|---|---|---|---|
| MIT | 209 | 231 | 440 |
| ISC | 46 | 18 | 64 |
| BSD-3-Clause | 10 | 13 | 23 |
| Apache-2.0 | 3 | 5 | 8 |
| BSD-2-Clause | 1 | 1 | 2 |
| CC-BY-4.0 | 0 | 1 | 1 |
| (MIT OR WTFPL) | 1 | 0 | 1 |
| MIT* | 1 | 0 | 1 |
| (BSD-2-Clause OR MIT OR Apache-2.0) | 1 | 0 | 1 |
| 0BSD | 1 | 0 | 1 |
| (MIT OR CC0-1.0) | 0 | 1 | 1 |

### `frontend/`

| License (SPDX) | Runtime | Dev-only | Total |
|---|---|---|---|
| MIT | 111 | 160 | 271 |
| ISC | 2 | 12 | 14 |
| Apache-2.0 | 0 | 13 | 13 |
| BSD-2-Clause | 0 | 6 | 6 |
| BSD-3-Clause | 3 | 2 | 5 |
| Python-2.0 | 0 | 1 | 1 |
| CC-BY-4.0 | 0 | 1 | 1 |

License scans ran twice per package: `license-checker-rseidelsohn --json --production` (runtime tree) and `license-checker-rseidelsohn --json` (runtime + dev). The license data from cdxgen and from license-checker matched for every component. The private root packages (`frontend@0.0.0` reported as `UNLICENSED`, `time-tracking-backend@1.0.0` as MIT) are first-party and left out of the counts.

## 4. Copyleft analysis & notable items

### 4.0 Copyleft screen (npm trees)

Every component in both trees (runtime and dev) was matched against `GPL|LGPL|AGPL|MPL|EPL|CC-BY-SA|SSPL|EUPL|CDDL|OSL`.

| Scope | backend | frontend |
|---|---|---|
| Runtime | 0 matches | 0 matches |
| Dev-only | 0 matches | 0 matches |

These non-MIT/ISC/BSD/Apache items were reviewed and need no action beyond keeping attribution:

| Package | Manifest | Scope | License | Note |
|---|---|---|---|---|
| `caniuse-lite@1.0.30001759` | backend | dev | CC-BY-4.0 | Browser-support **data** used by Browserslist at build time; attribution license (not share-alike); not shipped in the bundle. |
| `expand-template@2.0.3` | backend | runtime | (MIT OR WTFPL) | Dual-licensed; elect **MIT**. Pulled in by `prebuild-install` (sqlite3 binary download). |
| `png-js@1.0.0` | backend | runtime | MIT* | `package.json` has no `license` field (hence license-checker's `MIT*` = inferred); the bundled `LICENSE` file is MIT (Devon Govett). Pulled in by `pdfkit`. |
| `rc@1.2.8` | backend | runtime | (BSD-2-Clause OR MIT OR Apache-2.0) | Triple-licensed; elect **MIT**. |
| `tslib@2.8.1` | backend | runtime | 0BSD | 0BSD (public-domain-equivalent permissive). |
| `type-fest@0.21.3` | backend | dev | (MIT OR CC0-1.0) | Dual-licensed; elect **MIT**. |
| `argparse@2.0.1` | frontend | dev | Python-2.0 | Python Software Foundation License (permissive); pulled in by `js-yaml` (ESLint tooling). |
| `caniuse-lite@1.0.30001759` | frontend | dev | CC-BY-4.0 | Browser-support **data** used by Browserslist at build time; attribution license (not share-alike); not shipped in the bundle. |

### 4.1 `sqlite3` — native code (backend runtime)

| Item | Detail |
|---|---|
| Package | `sqlite3@5.1.7` (TryGhost/node-sqlite3) — **BSD-3-Clause** |
| Native addon | `build/Release/node_sqlite3.node`, a compiled N-API (`napi_versions` 3, 6) C/C++ binary loaded in-process by the API server |
| Bundled C library | SQLite amalgamation **3.44.2** (`deps/sqlite-autoconf-3440200.tar.gz`). SQLite is **public domain**. Some legal teams want a warranty of title for public-domain code; sqlite.org sells one if policy requires it |
| Install-time deps | `prebuild-install@7.1.3` (MIT) downloads a prebuilt binary from GitHub releases. If none matches the platform/ABI (e.g. Alpine/musl), it falls back to a source build via `node-gyp@8.4.1` (MIT, optional dependency) |
| Other runtime deps | `bindings@1.5.0` (MIT), `node-addon-api@7.1.1` (MIT), `tar@6.2.1` (ISC) |
| SBOM gap | The SBOM lists the npm package (purl `pkg:npm/sqlite3@5.1.7`), but not the hash of the platform-specific `.node` binary actually placed in the image, nor the bundled SQLite C library as its own component. For a stricter SBOM, add an image-level scan (e.g. `trivy image --format cyclonedx`) or a manual component for `sqlite@3.44.2` |
| Obligations | BSD-3-Clause: keep the copyright notice and license text in distributions; don't use contributors' names for endorsement. No copyleft |

### 4.2 MUI X — Community vs commercial licensing (frontend runtime)

| Package | Version | License |
|---|---|---|
| `@mui/x-date-pickers` | `8.19.0` | MIT |
| `@mui/x-internals` | `8.19.0` | MIT |
| `@mui/material` | `7.3.6` | MIT |
| `@mui/icons-material` | `7.3.6` | MIT |
| `@mui/system` | `7.3.6` | MIT |

- The app uses **`@mui/x-date-pickers`**, the **Community (MIT)** tier. You can use it freely; no license key needed.
- Neither `@mui/x-date-pickers-pro`, `@mui/x-data-grid-pro`/`-premium`, `@mui/x-charts-pro` nor `@mui/x-license` is in the tree, so **no commercial MUI X license is needed today**.
- **Watch out:** components such as `DateRangePicker`, `DateTimeRangePicker` and the Pro/Premium Data Grid come only from the `*-pro` / `*-premium` packages. These need a paid per-developer MUI X license plus a `LicenseInfo.setLicenseKey(...)` call, and without a key they show a watermark. Any PR that adds one should trigger a licensing review.
- `@mui/material`, `@mui/icons-material` and the rest of MUI Core are MIT.

### 4.3 Container-level components (`docker/Dockerfile`)

The npm SBOMs do **not** cover the OS layer. All three Dockerfile stages use `node:20-alpine`, and the production stage adds `dumb-init` via `apk`. Below is what's actually in that image (from `docker run node:20-alpine` with `apk add dumb-init`, inspected 2026-11-12):

| Item | Value |
|---|---|
| Base image | `node:20-alpine` → `node@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293` (created 2026-04-15) |
| OS | Alpine Linux 3.23.4 |
| Node.js runtime | v20.20.2 (LTS "Iron", **EOL 2026-04-30**), OpenSSL 3.0.19 — MIT (Node bundles third-party code under its own `LICENSE`) |
| Global npm tooling in image | `npm` 10.8.2 (Artistic-2.0), `corepack` (MIT), `yarn` 1.22.22 (BSD-2-Clause). These stay in the production image even though the app doesn't use them at runtime |
| `dumb-init` | `dumb-init-1.2.5-r3` (Alpine `community`) — **MIT** (Yelp). It is the PID 1 init (`ENTRYPOINT ["dumb-init", "--"]`) |

Installed Alpine packages (production stage):

| apk package | Version | License | Copyleft? |
|---|---|---|---|
| `alpine-baselayout` | `3.7.2-r0` | GPL-2.0-only | **Yes** |
| `alpine-baselayout-data` | `3.7.2-r0` | GPL-2.0-only | **Yes** |
| `alpine-keys` | `2.6-r0` | MIT | No |
| `alpine-release` | `3.23.4-r0` | MIT | No |
| `apk-tools` | `3.0.6-r0` | GPL-2.0-only | **Yes** |
| `libapk` | `3.0.6-r0` | GPL-2.0-only | **Yes** |
| `busybox` | `1.37.0-r30` | GPL-2.0-only | **Yes** |
| `busybox-binsh` | `1.37.0-r30` | GPL-2.0-only | **Yes** |
| `ssl_client` | `1.37.0-r30` | GPL-2.0-only | **Yes** |
| `scanelf` | `1.3.8-r2` | GPL-2.0-only | **Yes** |
| `ca-certificates-bundle` | `20260413-r0` | MPL-2.0 AND MIT | **Yes** |
| `libgcc` | `15.2.0-r2` | GPL-2.0-or-later AND LGPL-2.1-or-later | **Yes** |
| `libstdc++` | `15.2.0-r2` | GPL-2.0-or-later AND LGPL-2.1-or-later | **Yes** |
| `musl` | `1.2.5-r23` | MIT | No |
| `musl-utils` | `1.2.5-r23` | MIT AND BSD-2-Clause AND GPL-2.0-or-later | **Yes** |
| `libcrypto3` | `3.5.6-r0` | Apache-2.0 | No |
| `libssl3` | `3.5.6-r0` | Apache-2.0 | No |
| `zlib` | `1.3.2-r0` | Zlib | No |
| `dumb-init` | `1.2.5-r3` | MIT | No |

**Assessment:**
- The GPL-2.0 packages (BusyBox, apk-tools, alpine-baselayout, scanelf) are standalone OS programs. They are *aggregated* in the image and not linked with the application, so they do not make the app copyleft.
- `libgcc`/`libstdc++` are under the GCC Runtime Library Exception, which allows linking from non-GPL code such as the Node binary and `node_sqlite3.node`.
- `ca-certificates-bundle` is MPL-2.0 *data* (the Mozilla CA store). It is used unmodified.
- If you **distribute** the image to third parties (e.g. ship it to customers or push it to a public registry), you must honour the GPL source-availability obligations. Alpine publishes matching sources in [aports](https://gitlab.alpinelinux.org/alpine/aports). Running the image internally or as a hosted SaaS doesn't trigger GPL-2.0 distribution obligations.
- The `node:20-alpine` tag floats, so OS package versions change on every rebuild. Pin the base image by digest for reproducible container SBOMs.

## 5. Lockfiles & reproducibility

- **Status:** the task brief said no lockfiles were committed, but both are tracked in git (`git ls-files` lists `backend/package-lock.json` and `frontend/package-lock.json`, lockfileVersion 3). `npm install` in each package reported *up to date* and didn't modify the lockfiles. No lockfile changes are in this PR.
- **Recommendation — keep committing `package-lock.json`** (do not add it to `.gitignore`). It is what makes these SBOMs reproducible: the same commit always resolves to the same versions and integrity hashes. Without it, `^`/`~` ranges would resolve to different versions on every install, and the SBOM would describe a tree nobody actually deployed.
- Use `npm ci` everywhere you install (CI already does, in `.github/workflows/pr-checks.yml`, and so does the Dockerfile). Consider failing CI when `npm install --package-lock-only` produces a lockfile diff.
- In `docker/Dockerfile`, `npm ci --only=production` is deprecated in npm ≥ 7. Use `npm ci --omit=dev`.
- Regenerate the SBOMs in CI on each release (`npx @cyclonedx/cdxgen -t js -o sbom-<pkg>.json <pkg>/`) and attach them to the release artifact. Optionally add a container SBOM with `trivy image --format cyclonedx` against the built image to cover the OS layer and native binaries in §4.1/§4.3.

## 6. Recommendations (prioritised)

1. **Upgrade the base image** from `node:20-alpine` (EOL) to `node:22-alpine` or `node:24-alpine`, pinned by digest.
2. **Keep the lockfiles committed** and enforce `npm ci` / lockfile-drift checks (§5).
3. Add a **container-level SBOM** (Trivy/Syft) next to the npm SBOMs, so the OS packages and the `sqlite3` native binary are covered.
4. Add a **license policy gate** in CI, e.g. `npx license-checker-rseidelsohn --production --failOn 'GPL;LGPL;AGPL;MPL;EPL;CC-BY-SA;SSPL'` per package.
5. Add a **MUI X Pro/Premium tripwire**: flag any PR that adds `@mui/x-*-pro`, `@mui/x-*-premium` or `@mui/x-license` for licensing review.
6. Ship a **third-party notices** file (e.g. `npx license-checker-rseidelsohn --production --plainVertical`) with distributed builds to meet MIT/BSD/ISC attribution requirements, including for the frontend bundle served to browsers.

## 7. Full dependency inventory

Scope legend: `runtime` = installed in production; `runtime-optional` = optional production dependency (e.g. `node-gyp` subtree for the sqlite3 source-build fallback); `runtime-optional/dev` = needed by both an optional runtime dependency and dev tooling; `dev` = dev-only. **Direct** = declared in `package.json`. ✗ in *Installed* = in the lockfile/SBOM but not installed on the linux-x64 scan host (platform-specific binary).

<details>
<summary><b><code>backend/</code> — 543 packages</b></summary>

| # | Package | Version | License | Scope | Direct | Installed |
|---|---|---|---|---|---|---|
| 1 | `@babel/code-frame` | 7.27.1 | MIT | dev |  | ✓ |
| 2 | `@babel/compat-data` | 7.28.5 | MIT | dev |  | ✓ |
| 3 | `@babel/core` | 7.28.5 | MIT | dev |  | ✓ |
| 4 | `@babel/generator` | 7.28.5 | MIT | dev |  | ✓ |
| 5 | `@babel/helper-compilation-targets` | 7.27.2 | MIT | dev |  | ✓ |
| 6 | `@babel/helper-globals` | 7.28.0 | MIT | dev |  | ✓ |
| 7 | `@babel/helper-module-imports` | 7.27.1 | MIT | dev |  | ✓ |
| 8 | `@babel/helper-module-transforms` | 7.28.3 | MIT | dev |  | ✓ |
| 9 | `@babel/helper-plugin-utils` | 7.27.1 | MIT | dev |  | ✓ |
| 10 | `@babel/helper-string-parser` | 7.27.1 | MIT | dev |  | ✓ |
| 11 | `@babel/helper-validator-identifier` | 7.28.5 | MIT | dev |  | ✓ |
| 12 | `@babel/helper-validator-option` | 7.27.1 | MIT | dev |  | ✓ |
| 13 | `@babel/helpers` | 7.28.4 | MIT | dev |  | ✓ |
| 14 | `@babel/parser` | 7.28.5 | MIT | dev |  | ✓ |
| 15 | `@babel/plugin-syntax-async-generators` | 7.8.4 | MIT | dev |  | ✓ |
| 16 | `@babel/plugin-syntax-bigint` | 7.8.3 | MIT | dev |  | ✓ |
| 17 | `@babel/plugin-syntax-class-properties` | 7.12.13 | MIT | dev |  | ✓ |
| 18 | `@babel/plugin-syntax-class-static-block` | 7.14.5 | MIT | dev |  | ✓ |
| 19 | `@babel/plugin-syntax-import-attributes` | 7.27.1 | MIT | dev |  | ✓ |
| 20 | `@babel/plugin-syntax-import-meta` | 7.10.4 | MIT | dev |  | ✓ |
| 21 | `@babel/plugin-syntax-json-strings` | 7.8.3 | MIT | dev |  | ✓ |
| 22 | `@babel/plugin-syntax-jsx` | 7.27.1 | MIT | dev |  | ✓ |
| 23 | `@babel/plugin-syntax-logical-assignment-operators` | 7.10.4 | MIT | dev |  | ✓ |
| 24 | `@babel/plugin-syntax-nullish-coalescing-operator` | 7.8.3 | MIT | dev |  | ✓ |
| 25 | `@babel/plugin-syntax-numeric-separator` | 7.10.4 | MIT | dev |  | ✓ |
| 26 | `@babel/plugin-syntax-object-rest-spread` | 7.8.3 | MIT | dev |  | ✓ |
| 27 | `@babel/plugin-syntax-optional-catch-binding` | 7.8.3 | MIT | dev |  | ✓ |
| 28 | `@babel/plugin-syntax-optional-chaining` | 7.8.3 | MIT | dev |  | ✓ |
| 29 | `@babel/plugin-syntax-private-property-in-object` | 7.14.5 | MIT | dev |  | ✓ |
| 30 | `@babel/plugin-syntax-top-level-await` | 7.14.5 | MIT | dev |  | ✓ |
| 31 | `@babel/plugin-syntax-typescript` | 7.27.1 | MIT | dev |  | ✓ |
| 32 | `@babel/template` | 7.27.2 | MIT | dev |  | ✓ |
| 33 | `@babel/traverse` | 7.28.5 | MIT | dev |  | ✓ |
| 34 | `@babel/types` | 7.28.5 | MIT | dev |  | ✓ |
| 35 | `@bcoe/v8-coverage` | 0.2.3 | MIT | dev |  | ✓ |
| 36 | `@gar/promisify` | 1.1.3 | MIT | runtime-optional |  | ✓ |
| 37 | `@hapi/hoek` | 9.3.0 | BSD-3-Clause | runtime |  | ✓ |
| 38 | `@hapi/topo` | 5.1.0 | BSD-3-Clause | runtime |  | ✓ |
| 39 | `@istanbuljs/load-nyc-config` | 1.1.0 | ISC | dev |  | ✓ |
| 40 | `@istanbuljs/schema` | 0.1.3 | MIT | dev |  | ✓ |
| 41 | `@jest/console` | 29.7.0 | MIT | dev |  | ✓ |
| 42 | `@jest/core` | 29.7.0 | MIT | dev |  | ✓ |
| 43 | `@jest/environment` | 29.7.0 | MIT | dev |  | ✓ |
| 44 | `@jest/expect` | 29.7.0 | MIT | dev |  | ✓ |
| 45 | `@jest/expect-utils` | 29.7.0 | MIT | dev |  | ✓ |
| 46 | `@jest/fake-timers` | 29.7.0 | MIT | dev |  | ✓ |
| 47 | `@jest/globals` | 29.7.0 | MIT | dev |  | ✓ |
| 48 | `@jest/reporters` | 29.7.0 | MIT | dev |  | ✓ |
| 49 | `@jest/schemas` | 29.6.3 | MIT | dev |  | ✓ |
| 50 | `@jest/source-map` | 29.6.3 | MIT | dev |  | ✓ |
| 51 | `@jest/test-result` | 29.7.0 | MIT | dev |  | ✓ |
| 52 | `@jest/test-sequencer` | 29.7.0 | MIT | dev |  | ✓ |
| 53 | `@jest/transform` | 29.7.0 | MIT | dev |  | ✓ |
| 54 | `@jest/types` | 29.6.3 | MIT | dev |  | ✓ |
| 55 | `@jridgewell/gen-mapping` | 0.3.13 | MIT | dev |  | ✓ |
| 56 | `@jridgewell/remapping` | 2.3.5 | MIT | dev |  | ✓ |
| 57 | `@jridgewell/resolve-uri` | 3.1.2 | MIT | dev |  | ✓ |
| 58 | `@jridgewell/sourcemap-codec` | 1.5.5 | MIT | dev |  | ✓ |
| 59 | `@jridgewell/trace-mapping` | 0.3.31 | MIT | dev |  | ✓ |
| 60 | `@noble/hashes` | 1.8.0 | MIT | dev |  | ✓ |
| 61 | `@npmcli/fs` | 1.1.1 | ISC | runtime-optional |  | ✓ |
| 62 | `@npmcli/move-file` | 1.1.2 | MIT | runtime-optional |  | ✓ |
| 63 | `@paralleldrive/cuid2` | 2.3.1 | MIT | dev |  | ✓ |
| 64 | `@sideway/address` | 4.1.5 | BSD-3-Clause | runtime |  | ✓ |
| 65 | `@sideway/formula` | 3.0.1 | BSD-3-Clause | runtime |  | ✓ |
| 66 | `@sideway/pinpoint` | 2.0.0 | BSD-3-Clause | runtime |  | ✓ |
| 67 | `@sinclair/typebox` | 0.27.8 | MIT | dev |  | ✓ |
| 68 | `@sinonjs/commons` | 3.0.1 | BSD-3-Clause | dev |  | ✓ |
| 69 | `@sinonjs/fake-timers` | 10.3.0 | BSD-3-Clause | dev |  | ✓ |
| 70 | `@swc/helpers` | 0.3.17 | MIT | runtime |  | ✓ |
| 71 | `@tootallnate/once` | 1.1.2 | MIT | runtime-optional |  | ✓ |
| 72 | `@types/babel__core` | 7.20.5 | MIT | dev |  | ✓ |
| 73 | `@types/babel__generator` | 7.27.0 | MIT | dev |  | ✓ |
| 74 | `@types/babel__template` | 7.4.4 | MIT | dev |  | ✓ |
| 75 | `@types/babel__traverse` | 7.28.0 | MIT | dev |  | ✓ |
| 76 | `@types/graceful-fs` | 4.1.9 | MIT | dev |  | ✓ |
| 77 | `@types/istanbul-lib-coverage` | 2.0.6 | MIT | dev |  | ✓ |
| 78 | `@types/istanbul-lib-report` | 3.0.3 | MIT | dev |  | ✓ |
| 79 | `@types/istanbul-reports` | 3.0.4 | MIT | dev |  | ✓ |
| 80 | `@types/node` | 24.10.1 | MIT | dev |  | ✓ |
| 81 | `@types/stack-utils` | 2.0.3 | MIT | dev |  | ✓ |
| 82 | `@types/yargs` | 17.0.35 | MIT | dev |  | ✓ |
| 83 | `@types/yargs-parser` | 21.0.3 | MIT | dev |  | ✓ |
| 84 | `abbrev` | 1.1.1 | ISC | runtime-optional |  | ✓ |
| 85 | `accepts` | 1.3.8 | MIT | runtime |  | ✓ |
| 86 | `agent-base` | 6.0.2 | MIT | runtime-optional |  | ✓ |
| 87 | `agentkeepalive` | 4.6.0 | MIT | runtime-optional |  | ✓ |
| 88 | `aggregate-error` | 3.1.0 | MIT | runtime-optional |  | ✓ |
| 89 | `ansi-escapes` | 4.3.2 | MIT | dev |  | ✓ |
| 90 | `ansi-regex` | 5.0.1 | MIT | runtime-optional/dev |  | ✓ |
| 91 | `ansi-styles` | 4.3.0 | MIT | dev |  | ✓ |
| 92 | `ansi-styles` | 5.2.0 | MIT | dev |  | ✓ |
| 93 | `anymatch` | 3.1.3 | ISC | dev |  | ✓ |
| 94 | `aproba` | 2.1.0 | ISC | runtime-optional |  | ✓ |
| 95 | `are-we-there-yet` | 3.0.1 | ISC | runtime-optional |  | ✓ |
| 96 | `argparse` | 1.0.10 | MIT | dev |  | ✓ |
| 97 | `array-buffer-byte-length` | 1.0.2 | MIT | runtime |  | ✓ |
| 98 | `array-flatten` | 1.1.1 | MIT | runtime |  | ✓ |
| 99 | `asap` | 2.0.6 | MIT | dev |  | ✓ |
| 100 | `asynckit` | 0.4.0 | MIT | dev |  | ✓ |
| 101 | `available-typed-arrays` | 1.0.7 | MIT | runtime |  | ✓ |
| 102 | `babel-jest` | 29.7.0 | MIT | dev |  | ✓ |
| 103 | `babel-plugin-istanbul` | 6.1.1 | BSD-3-Clause | dev |  | ✓ |
| 104 | `babel-plugin-jest-hoist` | 29.6.3 | MIT | dev |  | ✓ |
| 105 | `babel-preset-current-node-syntax` | 1.2.0 | MIT | dev |  | ✓ |
| 106 | `babel-preset-jest` | 29.6.3 | MIT | dev |  | ✓ |
| 107 | `balanced-match` | 1.0.2 | MIT | runtime-optional/dev |  | ✓ |
| 108 | `base64-js` | 0.0.8 | MIT | runtime |  | ✓ |
| 109 | `base64-js` | 1.5.1 | MIT | runtime |  | ✓ |
| 110 | `baseline-browser-mapping` | 2.8.32 | Apache-2.0 | dev |  | ✓ |
| 111 | `basic-auth` | 2.0.1 | MIT | runtime |  | ✓ |
| 112 | `binary-extensions` | 2.3.0 | MIT | dev |  | ✓ |
| 113 | `bindings` | 1.5.0 | MIT | runtime |  | ✓ |
| 114 | `bl` | 4.1.0 | MIT | runtime |  | ✓ |
| 115 | `body-parser` | 1.20.4 | MIT | runtime |  | ✓ |
| 116 | `brace-expansion` | 1.1.12 | MIT | runtime-optional/dev |  | ✓ |
| 117 | `braces` | 3.0.3 | MIT | dev |  | ✓ |
| 118 | `brotli` | 1.3.3 | MIT | runtime |  | ✓ |
| 119 | `browserslist` | 4.28.0 | MIT | dev |  | ✓ |
| 120 | `bser` | 2.1.1 | Apache-2.0 | dev |  | ✓ |
| 121 | `buffer` | 5.7.1 | MIT | runtime |  | ✓ |
| 122 | `buffer-equal-constant-time` | 1.0.1 | BSD-3-Clause | runtime |  | ✓ |
| 123 | `buffer-from` | 1.1.2 | MIT | dev |  | ✓ |
| 124 | `bytes` | 3.1.2 | MIT | runtime |  | ✓ |
| 125 | `cacache` | 15.3.0 | ISC | runtime-optional |  | ✓ |
| 126 | `call-bind` | 1.0.8 | MIT | runtime |  | ✓ |
| 127 | `call-bind-apply-helpers` | 1.0.2 | MIT | runtime |  | ✓ |
| 128 | `call-bound` | 1.0.4 | MIT | runtime |  | ✓ |
| 129 | `callsites` | 3.1.0 | MIT | dev |  | ✓ |
| 130 | `camelcase` | 5.3.1 | MIT | dev |  | ✓ |
| 131 | `camelcase` | 6.3.0 | MIT | dev |  | ✓ |
| 132 | `caniuse-lite` | 1.0.30001759 | CC-BY-4.0 | dev |  | ✓ |
| 133 | `chalk` | 4.1.2 | MIT | dev |  | ✓ |
| 134 | `char-regex` | 1.0.2 | MIT | dev |  | ✓ |
| 135 | `chokidar` | 3.6.0 | MIT | dev |  | ✓ |
| 136 | `chownr` | 1.1.4 | ISC | runtime |  | ✓ |
| 137 | `chownr` | 2.0.0 | ISC | runtime |  | ✓ |
| 138 | `ci-info` | 3.9.0 | MIT | dev |  | ✓ |
| 139 | `cjs-module-lexer` | 1.4.3 | MIT | dev |  | ✓ |
| 140 | `clean-stack` | 2.2.0 | MIT | runtime-optional |  | ✓ |
| 141 | `cliui` | 8.0.1 | ISC | dev |  | ✓ |
| 142 | `clone` | 2.1.2 | MIT | runtime |  | ✓ |
| 143 | `co` | 4.6.0 | MIT | dev |  | ✓ |
| 144 | `collect-v8-coverage` | 1.0.3 | MIT | dev |  | ✓ |
| 145 | `color-convert` | 2.0.1 | MIT | dev |  | ✓ |
| 146 | `color-name` | 1.1.4 | MIT | dev |  | ✓ |
| 147 | `color-support` | 1.1.3 | ISC | runtime-optional |  | ✓ |
| 148 | `combined-stream` | 1.0.8 | MIT | dev |  | ✓ |
| 149 | `component-emitter` | 1.3.1 | MIT | dev |  | ✓ |
| 150 | `concat-map` | 0.0.1 | MIT | runtime-optional/dev |  | ✓ |
| 151 | `console-control-strings` | 1.1.0 | ISC | runtime-optional |  | ✓ |
| 152 | `content-disposition` | 0.5.4 | MIT | runtime |  | ✓ |
| 153 | `content-type` | 1.0.5 | MIT | runtime |  | ✓ |
| 154 | `convert-source-map` | 2.0.0 | MIT | dev |  | ✓ |
| 155 | `cookie` | 0.7.2 | MIT | runtime |  | ✓ |
| 156 | `cookie-signature` | 1.0.7 | MIT | runtime |  | ✓ |
| 157 | `cookiejar` | 2.1.4 | MIT | dev |  | ✓ |
| 158 | `cors` | 2.8.5 | MIT | runtime | ✓ | ✓ |
| 159 | `create-jest` | 29.7.0 | MIT | dev |  | ✓ |
| 160 | `cross-spawn` | 7.0.6 | MIT | dev |  | ✓ |
| 161 | `crypto-js` | 4.2.0 | MIT | runtime |  | ✓ |
| 162 | `csv-writer` | 1.6.0 | MIT | runtime | ✓ | ✓ |
| 163 | `debug` | 2.6.9 | MIT | runtime |  | ✓ |
| 164 | `debug` | 4.4.3 | MIT | runtime-optional |  | ✓ |
| 165 | `decompress-response` | 6.0.0 | MIT | runtime |  | ✓ |
| 166 | `dedent` | 1.7.0 | MIT | dev |  | ✓ |
| 167 | `deep-equal` | 2.2.3 | MIT | runtime |  | ✓ |
| 168 | `deep-extend` | 0.6.0 | MIT | runtime |  | ✓ |
| 169 | `deepmerge` | 4.3.1 | MIT | dev |  | ✓ |
| 170 | `define-data-property` | 1.1.4 | MIT | runtime |  | ✓ |
| 171 | `define-properties` | 1.2.1 | MIT | runtime |  | ✓ |
| 172 | `delayed-stream` | 1.0.0 | MIT | dev |  | ✓ |
| 173 | `delegates` | 1.0.0 | MIT | runtime-optional |  | ✓ |
| 174 | `depd` | 2.0.0 | MIT | runtime |  | ✓ |
| 175 | `destroy` | 1.2.0 | MIT | runtime |  | ✓ |
| 176 | `detect-libc` | 2.1.2 | Apache-2.0 | runtime |  | ✓ |
| 177 | `detect-newline` | 3.1.0 | MIT | dev |  | ✓ |
| 178 | `dezalgo` | 1.0.4 | ISC | dev |  | ✓ |
| 179 | `dfa` | 1.2.0 | MIT | runtime |  | ✓ |
| 180 | `diff-sequences` | 29.6.3 | MIT | dev |  | ✓ |
| 181 | `dunder-proto` | 1.0.1 | MIT | runtime |  | ✓ |
| 182 | `ecdsa-sig-formatter` | 1.0.11 | Apache-2.0 | runtime |  | ✓ |
| 183 | `ee-first` | 1.1.1 | MIT | runtime |  | ✓ |
| 184 | `electron-to-chromium` | 1.5.263 | ISC | dev |  | ✓ |
| 185 | `emittery` | 0.13.1 | MIT | dev |  | ✓ |
| 186 | `emoji-regex` | 8.0.0 | MIT | runtime-optional/dev |  | ✓ |
| 187 | `encodeurl` | 1.0.2 | MIT | runtime |  | ✓ |
| 188 | `encodeurl` | 2.0.0 | MIT | runtime |  | ✓ |
| 189 | `encoding` | 0.1.13 | MIT | runtime-optional |  | ✓ |
| 190 | `end-of-stream` | 1.4.5 | MIT | runtime |  | ✓ |
| 191 | `env-paths` | 2.2.1 | MIT | runtime-optional |  | ✓ |
| 192 | `err-code` | 2.0.3 | MIT | runtime-optional |  | ✓ |
| 193 | `error-ex` | 1.3.4 | MIT | dev |  | ✓ |
| 194 | `es-define-property` | 1.0.1 | MIT | runtime |  | ✓ |
| 195 | `es-errors` | 1.3.0 | MIT | runtime |  | ✓ |
| 196 | `es-get-iterator` | 1.1.3 | MIT | runtime |  | ✓ |
| 197 | `es-object-atoms` | 1.1.1 | MIT | runtime |  | ✓ |
| 198 | `es-set-tostringtag` | 2.1.0 | MIT | dev |  | ✓ |
| 199 | `escalade` | 3.2.0 | MIT | dev |  | ✓ |
| 200 | `escape-html` | 1.0.3 | MIT | runtime |  | ✓ |
| 201 | `escape-string-regexp` | 2.0.0 | MIT | dev |  | ✓ |
| 202 | `esprima` | 4.0.1 | BSD-2-Clause | dev |  | ✓ |
| 203 | `etag` | 1.8.1 | MIT | runtime |  | ✓ |
| 204 | `execa` | 5.1.1 | MIT | dev |  | ✓ |
| 205 | `exit` | 0.1.2 | MIT | dev |  | ✓ |
| 206 | `expand-template` | 2.0.3 | (MIT OR WTFPL) | runtime |  | ✓ |
| 207 | `expect` | 29.7.0 | MIT | dev |  | ✓ |
| 208 | `express` | 4.22.1 | MIT | runtime | ✓ | ✓ |
| 209 | `express-rate-limit` | 7.5.1 | MIT | runtime | ✓ | ✓ |
| 210 | `fast-json-stable-stringify` | 2.1.0 | MIT | dev |  | ✓ |
| 211 | `fast-safe-stringify` | 2.1.1 | MIT | dev |  | ✓ |
| 212 | `fb-watchman` | 2.0.2 | Apache-2.0 | dev |  | ✓ |
| 213 | `file-uri-to-path` | 1.0.0 | MIT | runtime |  | ✓ |
| 214 | `fill-range` | 7.1.1 | MIT | dev |  | ✓ |
| 215 | `finalhandler` | 1.3.2 | MIT | runtime |  | ✓ |
| 216 | `find-up` | 4.1.0 | MIT | dev |  | ✓ |
| 217 | `fontkit` | 1.9.0 | MIT | runtime |  | ✓ |
| 218 | `for-each` | 0.3.5 | MIT | runtime |  | ✓ |
| 219 | `form-data` | 4.0.5 | MIT | dev |  | ✓ |
| 220 | `formidable` | 2.1.5 | MIT | dev |  | ✓ |
| 221 | `forwarded` | 0.2.0 | MIT | runtime |  | ✓ |
| 222 | `fresh` | 0.5.2 | MIT | runtime |  | ✓ |
| 223 | `fs-constants` | 1.0.0 | MIT | runtime |  | ✓ |
| 224 | `fs-minipass` | 2.1.0 | ISC | runtime |  | ✓ |
| 225 | `fs.realpath` | 1.0.0 | ISC | runtime-optional/dev |  | ✓ |
| 226 | `fsevents` | 2.3.3 | MIT | dev |  | ✗ |
| 227 | `function-bind` | 1.1.2 | MIT | runtime |  | ✓ |
| 228 | `functions-have-names` | 1.2.3 | MIT | runtime |  | ✓ |
| 229 | `gauge` | 4.0.4 | ISC | runtime-optional |  | ✓ |
| 230 | `gensync` | 1.0.0-beta.2 | MIT | dev |  | ✓ |
| 231 | `get-caller-file` | 2.0.5 | ISC | dev |  | ✓ |
| 232 | `get-intrinsic` | 1.3.0 | MIT | runtime |  | ✓ |
| 233 | `get-package-type` | 0.1.0 | MIT | dev |  | ✓ |
| 234 | `get-proto` | 1.0.1 | MIT | runtime |  | ✓ |
| 235 | `get-stream` | 6.0.1 | MIT | dev |  | ✓ |
| 236 | `github-from-package` | 0.0.0 | MIT | runtime |  | ✓ |
| 237 | `glob` | 7.2.3 | ISC | runtime-optional/dev |  | ✓ |
| 238 | `glob-parent` | 5.1.2 | ISC | dev |  | ✓ |
| 239 | `gopd` | 1.2.0 | MIT | runtime |  | ✓ |
| 240 | `graceful-fs` | 4.2.11 | ISC | runtime-optional/dev |  | ✓ |
| 241 | `has-bigints` | 1.1.0 | MIT | runtime |  | ✓ |
| 242 | `has-flag` | 3.0.0 | MIT | dev |  | ✓ |
| 243 | `has-flag` | 4.0.0 | MIT | dev |  | ✓ |
| 244 | `has-property-descriptors` | 1.0.2 | MIT | runtime |  | ✓ |
| 245 | `has-symbols` | 1.1.0 | MIT | runtime |  | ✓ |
| 246 | `has-tostringtag` | 1.0.2 | MIT | runtime |  | ✓ |
| 247 | `has-unicode` | 2.0.1 | ISC | runtime-optional |  | ✓ |
| 248 | `hasown` | 2.0.2 | MIT | runtime |  | ✓ |
| 249 | `helmet` | 7.2.0 | MIT | runtime | ✓ | ✓ |
| 250 | `html-escaper` | 2.0.2 | MIT | dev |  | ✓ |
| 251 | `http-cache-semantics` | 4.2.0 | BSD-2-Clause | runtime-optional |  | ✓ |
| 252 | `http-errors` | 2.0.0 | MIT | runtime |  | ✓ |
| 253 | `http-errors` | 2.0.1 | MIT | runtime |  | ✓ |
| 254 | `http-proxy-agent` | 4.0.1 | MIT | runtime-optional |  | ✓ |
| 255 | `https-proxy-agent` | 5.0.1 | MIT | runtime-optional |  | ✓ |
| 256 | `human-signals` | 2.1.0 | Apache-2.0 | dev |  | ✓ |
| 257 | `humanize-ms` | 1.2.1 | MIT | runtime-optional |  | ✓ |
| 258 | `iconv-lite` | 0.4.24 | MIT | runtime |  | ✓ |
| 259 | `iconv-lite` | 0.6.3 | MIT | runtime-optional |  | ✓ |
| 260 | `ieee754` | 1.2.1 | BSD-3-Clause | runtime |  | ✓ |
| 261 | `ignore-by-default` | 1.0.1 | ISC | dev |  | ✓ |
| 262 | `import-local` | 3.2.0 | MIT | dev |  | ✓ |
| 263 | `imurmurhash` | 0.1.4 | MIT | runtime-optional/dev |  | ✓ |
| 264 | `indent-string` | 4.0.0 | MIT | runtime-optional |  | ✓ |
| 265 | `infer-owner` | 1.0.4 | ISC | runtime-optional |  | ✓ |
| 266 | `inflight` | 1.0.6 | ISC | runtime-optional/dev |  | ✓ |
| 267 | `inherits` | 2.0.4 | ISC | runtime |  | ✓ |
| 268 | `ini` | 1.3.8 | ISC | runtime |  | ✓ |
| 269 | `internal-slot` | 1.1.0 | MIT | runtime |  | ✓ |
| 270 | `ip-address` | 10.1.0 | MIT | runtime-optional |  | ✓ |
| 271 | `ipaddr.js` | 1.9.1 | MIT | runtime |  | ✓ |
| 272 | `is-arguments` | 1.2.0 | MIT | runtime |  | ✓ |
| 273 | `is-array-buffer` | 3.0.5 | MIT | runtime |  | ✓ |
| 274 | `is-arrayish` | 0.2.1 | MIT | dev |  | ✓ |
| 275 | `is-bigint` | 1.1.0 | MIT | runtime |  | ✓ |
| 276 | `is-binary-path` | 2.1.0 | MIT | dev |  | ✓ |
| 277 | `is-boolean-object` | 1.2.2 | MIT | runtime |  | ✓ |
| 278 | `is-callable` | 1.2.7 | MIT | runtime |  | ✓ |
| 279 | `is-core-module` | 2.16.1 | MIT | dev |  | ✓ |
| 280 | `is-date-object` | 1.1.0 | MIT | runtime |  | ✓ |
| 281 | `is-extglob` | 2.1.1 | MIT | dev |  | ✓ |
| 282 | `is-fullwidth-code-point` | 3.0.0 | MIT | runtime-optional/dev |  | ✓ |
| 283 | `is-generator-fn` | 2.1.0 | MIT | dev |  | ✓ |
| 284 | `is-glob` | 4.0.3 | MIT | dev |  | ✓ |
| 285 | `is-lambda` | 1.0.1 | MIT | runtime-optional |  | ✓ |
| 286 | `is-map` | 2.0.3 | MIT | runtime |  | ✓ |
| 287 | `is-number` | 7.0.0 | MIT | dev |  | ✓ |
| 288 | `is-number-object` | 1.1.1 | MIT | runtime |  | ✓ |
| 289 | `is-regex` | 1.2.1 | MIT | runtime |  | ✓ |
| 290 | `is-set` | 2.0.3 | MIT | runtime |  | ✓ |
| 291 | `is-shared-array-buffer` | 1.0.4 | MIT | runtime |  | ✓ |
| 292 | `is-stream` | 2.0.1 | MIT | dev |  | ✓ |
| 293 | `is-string` | 1.1.1 | MIT | runtime |  | ✓ |
| 294 | `is-symbol` | 1.1.1 | MIT | runtime |  | ✓ |
| 295 | `is-weakmap` | 2.0.2 | MIT | runtime |  | ✓ |
| 296 | `is-weakset` | 2.0.4 | MIT | runtime |  | ✓ |
| 297 | `isarray` | 2.0.5 | MIT | runtime |  | ✓ |
| 298 | `isexe` | 2.0.0 | ISC | runtime-optional/dev |  | ✓ |
| 299 | `istanbul-lib-coverage` | 3.2.2 | BSD-3-Clause | dev |  | ✓ |
| 300 | `istanbul-lib-instrument` | 5.2.1 | BSD-3-Clause | dev |  | ✓ |
| 301 | `istanbul-lib-instrument` | 6.0.3 | BSD-3-Clause | dev |  | ✓ |
| 302 | `istanbul-lib-report` | 3.0.1 | BSD-3-Clause | dev |  | ✓ |
| 303 | `istanbul-lib-source-maps` | 4.0.1 | BSD-3-Clause | dev |  | ✓ |
| 304 | `istanbul-reports` | 3.2.0 | BSD-3-Clause | dev |  | ✓ |
| 305 | `jest` | 29.7.0 | MIT | dev | ✓ | ✓ |
| 306 | `jest-changed-files` | 29.7.0 | MIT | dev |  | ✓ |
| 307 | `jest-circus` | 29.7.0 | MIT | dev |  | ✓ |
| 308 | `jest-cli` | 29.7.0 | MIT | dev |  | ✓ |
| 309 | `jest-config` | 29.7.0 | MIT | dev |  | ✓ |
| 310 | `jest-diff` | 29.7.0 | MIT | dev |  | ✓ |
| 311 | `jest-docblock` | 29.7.0 | MIT | dev |  | ✓ |
| 312 | `jest-each` | 29.7.0 | MIT | dev |  | ✓ |
| 313 | `jest-environment-node` | 29.7.0 | MIT | dev |  | ✓ |
| 314 | `jest-get-type` | 29.6.3 | MIT | dev |  | ✓ |
| 315 | `jest-haste-map` | 29.7.0 | MIT | dev |  | ✓ |
| 316 | `jest-leak-detector` | 29.7.0 | MIT | dev |  | ✓ |
| 317 | `jest-matcher-utils` | 29.7.0 | MIT | dev |  | ✓ |
| 318 | `jest-message-util` | 29.7.0 | MIT | dev |  | ✓ |
| 319 | `jest-mock` | 29.7.0 | MIT | dev |  | ✓ |
| 320 | `jest-pnp-resolver` | 1.2.3 | MIT | dev |  | ✓ |
| 321 | `jest-regex-util` | 29.6.3 | MIT | dev |  | ✓ |
| 322 | `jest-resolve` | 29.7.0 | MIT | dev |  | ✓ |
| 323 | `jest-resolve-dependencies` | 29.7.0 | MIT | dev |  | ✓ |
| 324 | `jest-runner` | 29.7.0 | MIT | dev |  | ✓ |
| 325 | `jest-runtime` | 29.7.0 | MIT | dev |  | ✓ |
| 326 | `jest-snapshot` | 29.7.0 | MIT | dev |  | ✓ |
| 327 | `jest-util` | 29.7.0 | MIT | dev |  | ✓ |
| 328 | `jest-validate` | 29.7.0 | MIT | dev |  | ✓ |
| 329 | `jest-watcher` | 29.7.0 | MIT | dev |  | ✓ |
| 330 | `jest-worker` | 29.7.0 | MIT | dev |  | ✓ |
| 331 | `joi` | 17.13.3 | BSD-3-Clause | runtime | ✓ | ✓ |
| 332 | `js-tokens` | 4.0.0 | MIT | dev |  | ✓ |
| 333 | `js-yaml` | 3.14.2 | MIT | dev |  | ✓ |
| 334 | `jsesc` | 3.1.0 | MIT | dev |  | ✓ |
| 335 | `json-parse-even-better-errors` | 2.3.1 | MIT | dev |  | ✓ |
| 336 | `json5` | 2.2.3 | MIT | dev |  | ✓ |
| 337 | `jsonwebtoken` | 9.0.2 | MIT | runtime | ✓ | ✓ |
| 338 | `jwa` | 1.4.2 | MIT | runtime |  | ✓ |
| 339 | `jws` | 3.2.2 | MIT | runtime |  | ✓ |
| 340 | `kleur` | 3.0.3 | MIT | dev |  | ✓ |
| 341 | `leven` | 3.1.0 | MIT | dev |  | ✓ |
| 342 | `linebreak` | 1.1.0 | MIT | runtime |  | ✓ |
| 343 | `lines-and-columns` | 1.2.4 | MIT | dev |  | ✓ |
| 344 | `locate-path` | 5.0.0 | MIT | dev |  | ✓ |
| 345 | `lodash.includes` | 4.3.0 | MIT | runtime |  | ✓ |
| 346 | `lodash.isboolean` | 3.0.3 | MIT | runtime |  | ✓ |
| 347 | `lodash.isinteger` | 4.0.4 | MIT | runtime |  | ✓ |
| 348 | `lodash.isnumber` | 3.0.3 | MIT | runtime |  | ✓ |
| 349 | `lodash.isplainobject` | 4.0.6 | MIT | runtime |  | ✓ |
| 350 | `lodash.isstring` | 4.0.1 | MIT | runtime |  | ✓ |
| 351 | `lodash.once` | 4.1.1 | MIT | runtime |  | ✓ |
| 352 | `lru-cache` | 5.1.1 | ISC | dev |  | ✓ |
| 353 | `lru-cache` | 6.0.0 | ISC | runtime-optional |  | ✓ |
| 354 | `make-dir` | 4.0.0 | MIT | dev |  | ✓ |
| 355 | `make-fetch-happen` | 9.1.0 | ISC | runtime-optional |  | ✓ |
| 356 | `makeerror` | 1.0.12 | BSD-3-Clause | dev |  | ✓ |
| 357 | `math-intrinsics` | 1.1.0 | MIT | runtime |  | ✓ |
| 358 | `media-typer` | 0.3.0 | MIT | runtime |  | ✓ |
| 359 | `merge-descriptors` | 1.0.3 | MIT | runtime |  | ✓ |
| 360 | `merge-stream` | 2.0.0 | MIT | dev |  | ✓ |
| 361 | `methods` | 1.1.2 | MIT | runtime |  | ✓ |
| 362 | `micromatch` | 4.0.8 | MIT | dev |  | ✓ |
| 363 | `mime` | 1.6.0 | MIT | runtime |  | ✓ |
| 364 | `mime` | 2.6.0 | MIT | dev |  | ✓ |
| 365 | `mime-db` | 1.52.0 | MIT | runtime |  | ✓ |
| 366 | `mime-types` | 2.1.35 | MIT | runtime |  | ✓ |
| 367 | `mimic-fn` | 2.1.0 | MIT | dev |  | ✓ |
| 368 | `mimic-response` | 3.1.0 | MIT | runtime |  | ✓ |
| 369 | `minimatch` | 3.1.2 | ISC | runtime-optional/dev |  | ✓ |
| 370 | `minimist` | 1.2.8 | MIT | runtime |  | ✓ |
| 371 | `minipass` | 3.3.6 | ISC | runtime |  | ✓ |
| 372 | `minipass` | 5.0.0 | ISC | runtime |  | ✓ |
| 373 | `minipass-collect` | 1.0.2 | ISC | runtime-optional |  | ✓ |
| 374 | `minipass-fetch` | 1.4.1 | MIT | runtime-optional |  | ✓ |
| 375 | `minipass-flush` | 1.0.5 | ISC | runtime-optional |  | ✓ |
| 376 | `minipass-pipeline` | 1.2.4 | ISC | runtime-optional |  | ✓ |
| 377 | `minipass-sized` | 1.0.3 | ISC | runtime-optional |  | ✓ |
| 378 | `minizlib` | 2.1.2 | MIT | runtime |  | ✓ |
| 379 | `mkdirp` | 1.0.4 | MIT | runtime |  | ✓ |
| 380 | `mkdirp-classic` | 0.5.3 | MIT | runtime |  | ✓ |
| 381 | `morgan` | 1.10.1 | MIT | runtime | ✓ | ✓ |
| 382 | `ms` | 2.0.0 | MIT | runtime |  | ✓ |
| 383 | `ms` | 2.1.3 | MIT | runtime |  | ✓ |
| 384 | `napi-build-utils` | 2.0.0 | MIT | runtime |  | ✓ |
| 385 | `natural-compare` | 1.4.0 | MIT | dev |  | ✓ |
| 386 | `negotiator` | 0.6.3 | MIT | runtime |  | ✓ |
| 387 | `node-abi` | 3.85.0 | MIT | runtime |  | ✓ |
| 388 | `node-addon-api` | 7.1.1 | MIT | runtime |  | ✓ |
| 389 | `node-gyp` | 8.4.1 | MIT | runtime-optional |  | ✓ |
| 390 | `node-int64` | 0.4.0 | MIT | dev |  | ✓ |
| 391 | `node-releases` | 2.0.27 | MIT | dev |  | ✓ |
| 392 | `nodemon` | 3.1.11 | MIT | dev | ✓ | ✓ |
| 393 | `nopt` | 5.0.0 | ISC | runtime-optional |  | ✓ |
| 394 | `normalize-path` | 3.0.0 | MIT | dev |  | ✓ |
| 395 | `npm-run-path` | 4.0.1 | MIT | dev |  | ✓ |
| 396 | `npmlog` | 6.0.2 | ISC | runtime-optional |  | ✓ |
| 397 | `object-assign` | 4.1.1 | MIT | runtime |  | ✓ |
| 398 | `object-inspect` | 1.13.4 | MIT | runtime |  | ✓ |
| 399 | `object-is` | 1.1.6 | MIT | runtime |  | ✓ |
| 400 | `object-keys` | 1.1.1 | MIT | runtime |  | ✓ |
| 401 | `object.assign` | 4.1.7 | MIT | runtime |  | ✓ |
| 402 | `on-finished` | 2.3.0 | MIT | runtime |  | ✓ |
| 403 | `on-finished` | 2.4.1 | MIT | runtime |  | ✓ |
| 404 | `on-headers` | 1.1.0 | MIT | runtime |  | ✓ |
| 405 | `once` | 1.4.0 | ISC | runtime |  | ✓ |
| 406 | `onetime` | 5.1.2 | MIT | dev |  | ✓ |
| 407 | `p-limit` | 2.3.0 | MIT | dev |  | ✓ |
| 408 | `p-limit` | 3.1.0 | MIT | dev |  | ✓ |
| 409 | `p-locate` | 4.1.0 | MIT | dev |  | ✓ |
| 410 | `p-map` | 4.0.0 | MIT | runtime-optional |  | ✓ |
| 411 | `p-try` | 2.2.0 | MIT | dev |  | ✓ |
| 412 | `pako` | 0.2.9 | MIT | runtime |  | ✓ |
| 413 | `parse-json` | 5.2.0 | MIT | dev |  | ✓ |
| 414 | `parseurl` | 1.3.3 | MIT | runtime |  | ✓ |
| 415 | `path-exists` | 4.0.0 | MIT | dev |  | ✓ |
| 416 | `path-is-absolute` | 1.0.1 | MIT | runtime-optional/dev |  | ✓ |
| 417 | `path-key` | 3.1.1 | MIT | dev |  | ✓ |
| 418 | `path-parse` | 1.0.7 | MIT | dev |  | ✓ |
| 419 | `path-to-regexp` | 0.1.12 | MIT | runtime |  | ✓ |
| 420 | `pdfkit` | 0.13.0 | MIT | runtime | ✓ | ✓ |
| 421 | `picocolors` | 1.1.1 | ISC | dev |  | ✓ |
| 422 | `picomatch` | 2.3.1 | MIT | dev |  | ✓ |
| 423 | `pirates` | 4.0.7 | MIT | dev |  | ✓ |
| 424 | `pkg-dir` | 4.2.0 | MIT | dev |  | ✓ |
| 425 | `png-js` | 1.0.0 | MIT* | runtime |  | ✓ |
| 426 | `possible-typed-array-names` | 1.1.0 | MIT | runtime |  | ✓ |
| 427 | `prebuild-install` | 7.1.3 | MIT | runtime |  | ✓ |
| 428 | `pretty-format` | 29.7.0 | MIT | dev |  | ✓ |
| 429 | `promise-inflight` | 1.0.1 | ISC | runtime-optional |  | ✓ |
| 430 | `promise-retry` | 2.0.1 | MIT | runtime-optional |  | ✓ |
| 431 | `prompts` | 2.4.2 | MIT | dev |  | ✓ |
| 432 | `proxy-addr` | 2.0.7 | MIT | runtime |  | ✓ |
| 433 | `pstree.remy` | 1.1.8 | MIT | dev |  | ✓ |
| 434 | `pump` | 3.0.3 | MIT | runtime |  | ✓ |
| 435 | `pure-rand` | 6.1.0 | MIT | dev |  | ✓ |
| 436 | `qs` | 6.14.0 | BSD-3-Clause | runtime |  | ✓ |
| 437 | `range-parser` | 1.2.1 | MIT | runtime |  | ✓ |
| 438 | `raw-body` | 2.5.3 | MIT | runtime |  | ✓ |
| 439 | `rc` | 1.2.8 | (BSD-2-Clause OR MIT OR Apache-2.0) | runtime |  | ✓ |
| 440 | `react-is` | 18.3.1 | MIT | dev |  | ✓ |
| 441 | `readable-stream` | 3.6.2 | MIT | runtime |  | ✓ |
| 442 | `readdirp` | 3.6.0 | MIT | dev |  | ✓ |
| 443 | `regexp.prototype.flags` | 1.5.4 | MIT | runtime |  | ✓ |
| 444 | `require-directory` | 2.1.1 | MIT | dev |  | ✓ |
| 445 | `resolve` | 1.22.11 | MIT | dev |  | ✓ |
| 446 | `resolve-cwd` | 3.0.0 | MIT | dev |  | ✓ |
| 447 | `resolve-from` | 5.0.0 | MIT | dev |  | ✓ |
| 448 | `resolve.exports` | 2.0.3 | MIT | dev |  | ✓ |
| 449 | `restructure` | 2.0.1 | MIT | runtime |  | ✓ |
| 450 | `retry` | 0.12.0 | MIT | runtime-optional |  | ✓ |
| 451 | `rimraf` | 3.0.2 | ISC | runtime-optional |  | ✓ |
| 452 | `safe-buffer` | 5.1.2 | MIT | runtime |  | ✓ |
| 453 | `safe-buffer` | 5.2.1 | MIT | runtime |  | ✓ |
| 454 | `safe-regex-test` | 1.1.0 | MIT | runtime |  | ✓ |
| 455 | `safer-buffer` | 2.1.2 | MIT | runtime |  | ✓ |
| 456 | `semver` | 6.3.1 | ISC | dev |  | ✓ |
| 457 | `semver` | 7.7.3 | ISC | runtime |  | ✓ |
| 458 | `send` | 0.19.0 | MIT | runtime |  | ✓ |
| 459 | `send` | 0.19.1 | MIT | runtime |  | ✓ |
| 460 | `serve-static` | 1.16.2 | MIT | runtime |  | ✓ |
| 461 | `set-blocking` | 2.0.0 | ISC | runtime-optional |  | ✓ |
| 462 | `set-function-length` | 1.2.2 | MIT | runtime |  | ✓ |
| 463 | `set-function-name` | 2.0.2 | MIT | runtime |  | ✓ |
| 464 | `setprototypeof` | 1.2.0 | ISC | runtime |  | ✓ |
| 465 | `shebang-command` | 2.0.0 | MIT | dev |  | ✓ |
| 466 | `shebang-regex` | 3.0.0 | MIT | dev |  | ✓ |
| 467 | `side-channel` | 1.1.0 | MIT | runtime |  | ✓ |
| 468 | `side-channel-list` | 1.0.0 | MIT | runtime |  | ✓ |
| 469 | `side-channel-map` | 1.0.1 | MIT | runtime |  | ✓ |
| 470 | `side-channel-weakmap` | 1.0.2 | MIT | runtime |  | ✓ |
| 471 | `signal-exit` | 3.0.7 | ISC | runtime-optional/dev |  | ✓ |
| 472 | `simple-concat` | 1.0.1 | MIT | runtime |  | ✓ |
| 473 | `simple-get` | 4.0.1 | MIT | runtime |  | ✓ |
| 474 | `simple-update-notifier` | 2.0.0 | MIT | dev |  | ✓ |
| 475 | `sisteransi` | 1.0.5 | MIT | dev |  | ✓ |
| 476 | `slash` | 3.0.0 | MIT | dev |  | ✓ |
| 477 | `smart-buffer` | 4.2.0 | MIT | runtime-optional |  | ✓ |
| 478 | `socks` | 2.8.7 | MIT | runtime-optional |  | ✓ |
| 479 | `socks-proxy-agent` | 6.2.1 | MIT | runtime-optional |  | ✓ |
| 480 | `source-map` | 0.6.1 | BSD-3-Clause | dev |  | ✓ |
| 481 | `source-map-support` | 0.5.13 | MIT | dev |  | ✓ |
| 482 | `sprintf-js` | 1.0.3 | BSD-3-Clause | dev |  | ✓ |
| 483 | `sqlite3` | 5.1.7 | BSD-3-Clause | runtime | ✓ | ✓ |
| 484 | `ssri` | 8.0.1 | ISC | runtime-optional |  | ✓ |
| 485 | `stack-utils` | 2.0.6 | MIT | dev |  | ✓ |
| 486 | `statuses` | 2.0.1 | MIT | runtime |  | ✓ |
| 487 | `statuses` | 2.0.2 | MIT | runtime |  | ✓ |
| 488 | `stop-iteration-iterator` | 1.1.0 | MIT | runtime |  | ✓ |
| 489 | `string-length` | 4.0.2 | MIT | dev |  | ✓ |
| 490 | `string-width` | 4.2.3 | MIT | runtime-optional/dev |  | ✓ |
| 491 | `string_decoder` | 1.3.0 | MIT | runtime |  | ✓ |
| 492 | `strip-ansi` | 6.0.1 | MIT | runtime-optional/dev |  | ✓ |
| 493 | `strip-bom` | 4.0.0 | MIT | dev |  | ✓ |
| 494 | `strip-final-newline` | 2.0.0 | MIT | dev |  | ✓ |
| 495 | `strip-json-comments` | 2.0.1 | MIT | runtime |  | ✓ |
| 496 | `strip-json-comments` | 3.1.1 | MIT | dev |  | ✓ |
| 497 | `superagent` | 8.1.2 | MIT | dev |  | ✓ |
| 498 | `supertest` | 6.3.4 | MIT | dev | ✓ | ✓ |
| 499 | `supports-color` | 5.5.0 | MIT | dev |  | ✓ |
| 500 | `supports-color` | 7.2.0 | MIT | dev |  | ✓ |
| 501 | `supports-color` | 8.1.1 | MIT | dev |  | ✓ |
| 502 | `supports-preserve-symlinks-flag` | 1.0.0 | MIT | dev |  | ✓ |
| 503 | `tar` | 6.2.1 | ISC | runtime |  | ✓ |
| 504 | `tar-fs` | 2.1.4 | MIT | runtime |  | ✓ |
| 505 | `tar-stream` | 2.2.0 | MIT | runtime |  | ✓ |
| 506 | `test-exclude` | 6.0.0 | ISC | dev |  | ✓ |
| 507 | `tiny-inflate` | 1.0.3 | MIT | runtime |  | ✓ |
| 508 | `tmpl` | 1.0.5 | BSD-3-Clause | dev |  | ✓ |
| 509 | `to-regex-range` | 5.0.1 | MIT | dev |  | ✓ |
| 510 | `toidentifier` | 1.0.1 | MIT | runtime |  | ✓ |
| 511 | `touch` | 3.1.1 | ISC | dev |  | ✓ |
| 512 | `tslib` | 2.8.1 | 0BSD | runtime |  | ✓ |
| 513 | `tunnel-agent` | 0.6.0 | Apache-2.0 | runtime |  | ✓ |
| 514 | `type-detect` | 4.0.8 | MIT | dev |  | ✓ |
| 515 | `type-fest` | 0.21.3 | (MIT OR CC0-1.0) | dev |  | ✓ |
| 516 | `type-is` | 1.6.18 | MIT | runtime |  | ✓ |
| 517 | `undefsafe` | 2.0.5 | MIT | dev |  | ✓ |
| 518 | `undici-types` | 7.16.0 | MIT | dev |  | ✓ |
| 519 | `unicode-properties` | 1.4.1 | MIT | runtime |  | ✓ |
| 520 | `unicode-trie` | 2.0.0 | MIT | runtime |  | ✓ |
| 521 | `unique-filename` | 1.1.1 | ISC | runtime-optional |  | ✓ |
| 522 | `unique-slug` | 2.0.2 | ISC | runtime-optional |  | ✓ |
| 523 | `unpipe` | 1.0.0 | MIT | runtime |  | ✓ |
| 524 | `update-browserslist-db` | 1.1.4 | MIT | dev |  | ✓ |
| 525 | `util-deprecate` | 1.0.2 | MIT | runtime |  | ✓ |
| 526 | `utils-merge` | 1.0.1 | MIT | runtime |  | ✓ |
| 527 | `v8-to-istanbul` | 9.3.0 | ISC | dev |  | ✓ |
| 528 | `vary` | 1.1.2 | MIT | runtime |  | ✓ |
| 529 | `walker` | 1.0.8 | Apache-2.0 | dev |  | ✓ |
| 530 | `which` | 2.0.2 | ISC | runtime-optional/dev |  | ✓ |
| 531 | `which-boxed-primitive` | 1.1.1 | MIT | runtime |  | ✓ |
| 532 | `which-collection` | 1.0.2 | MIT | runtime |  | ✓ |
| 533 | `which-typed-array` | 1.1.19 | MIT | runtime |  | ✓ |
| 534 | `wide-align` | 1.1.5 | ISC | runtime-optional |  | ✓ |
| 535 | `wrap-ansi` | 7.0.0 | MIT | dev |  | ✓ |
| 536 | `wrappy` | 1.0.2 | ISC | runtime |  | ✓ |
| 537 | `write-file-atomic` | 4.0.2 | ISC | dev |  | ✓ |
| 538 | `y18n` | 5.0.8 | ISC | dev |  | ✓ |
| 539 | `yallist` | 3.1.1 | ISC | dev |  | ✓ |
| 540 | `yallist` | 4.0.0 | ISC | runtime |  | ✓ |
| 541 | `yargs` | 17.7.2 | MIT | dev |  | ✓ |
| 542 | `yargs-parser` | 21.1.1 | ISC | dev |  | ✓ |
| 543 | `yocto-queue` | 0.1.0 | MIT | dev |  | ✓ |

</details>

<details>
<summary><b><code>frontend/</code> — 311 packages</b></summary>

| # | Package | Version | License | Scope | Direct | Installed |
|---|---|---|---|---|---|---|
| 1 | `@babel/code-frame` | 7.27.1 | MIT | runtime |  | ✓ |
| 2 | `@babel/compat-data` | 7.28.5 | MIT | dev |  | ✓ |
| 3 | `@babel/core` | 7.28.5 | MIT | dev |  | ✓ |
| 4 | `@babel/generator` | 7.28.5 | MIT | runtime |  | ✓ |
| 5 | `@babel/helper-compilation-targets` | 7.27.2 | MIT | dev |  | ✓ |
| 6 | `@babel/helper-globals` | 7.28.0 | MIT | runtime |  | ✓ |
| 7 | `@babel/helper-module-imports` | 7.27.1 | MIT | runtime |  | ✓ |
| 8 | `@babel/helper-module-transforms` | 7.28.3 | MIT | dev |  | ✓ |
| 9 | `@babel/helper-plugin-utils` | 7.27.1 | MIT | dev |  | ✓ |
| 10 | `@babel/helper-string-parser` | 7.27.1 | MIT | runtime |  | ✓ |
| 11 | `@babel/helper-validator-identifier` | 7.28.5 | MIT | runtime |  | ✓ |
| 12 | `@babel/helper-validator-option` | 7.27.1 | MIT | dev |  | ✓ |
| 13 | `@babel/helpers` | 7.28.4 | MIT | dev |  | ✓ |
| 14 | `@babel/parser` | 7.28.5 | MIT | runtime |  | ✓ |
| 15 | `@babel/plugin-transform-react-jsx-self` | 7.27.1 | MIT | dev |  | ✓ |
| 16 | `@babel/plugin-transform-react-jsx-source` | 7.27.1 | MIT | dev |  | ✓ |
| 17 | `@babel/runtime` | 7.28.4 | MIT | runtime |  | ✓ |
| 18 | `@babel/template` | 7.27.2 | MIT | runtime |  | ✓ |
| 19 | `@babel/traverse` | 7.28.5 | MIT | runtime |  | ✓ |
| 20 | `@babel/types` | 7.28.5 | MIT | runtime |  | ✓ |
| 21 | `@emotion/babel-plugin` | 11.13.5 | MIT | runtime |  | ✓ |
| 22 | `@emotion/cache` | 11.14.0 | MIT | runtime |  | ✓ |
| 23 | `@emotion/hash` | 0.9.2 | MIT | runtime |  | ✓ |
| 24 | `@emotion/is-prop-valid` | 1.4.0 | MIT | runtime |  | ✓ |
| 25 | `@emotion/memoize` | 0.9.0 | MIT | runtime |  | ✓ |
| 26 | `@emotion/react` | 11.14.0 | MIT | runtime | ✓ | ✓ |
| 27 | `@emotion/serialize` | 1.3.3 | MIT | runtime |  | ✓ |
| 28 | `@emotion/sheet` | 1.4.0 | MIT | runtime |  | ✓ |
| 29 | `@emotion/styled` | 11.14.1 | MIT | runtime | ✓ | ✓ |
| 30 | `@emotion/unitless` | 0.10.0 | MIT | runtime |  | ✓ |
| 31 | `@emotion/use-insertion-effect-with-fallbacks` | 1.2.0 | MIT | runtime |  | ✓ |
| 32 | `@emotion/utils` | 1.4.2 | MIT | runtime |  | ✓ |
| 33 | `@emotion/weak-memoize` | 0.4.0 | MIT | runtime |  | ✓ |
| 34 | `@esbuild/aix-ppc64` | 0.25.12 | MIT | dev |  | ✗ |
| 35 | `@esbuild/android-arm` | 0.25.12 | MIT | dev |  | ✗ |
| 36 | `@esbuild/android-arm64` | 0.25.12 | MIT | dev |  | ✗ |
| 37 | `@esbuild/android-x64` | 0.25.12 | MIT | dev |  | ✗ |
| 38 | `@esbuild/darwin-arm64` | 0.25.12 | MIT | dev |  | ✗ |
| 39 | `@esbuild/darwin-x64` | 0.25.12 | MIT | dev |  | ✗ |
| 40 | `@esbuild/freebsd-arm64` | 0.25.12 | MIT | dev |  | ✗ |
| 41 | `@esbuild/freebsd-x64` | 0.25.12 | MIT | dev |  | ✗ |
| 42 | `@esbuild/linux-arm` | 0.25.12 | MIT | dev |  | ✗ |
| 43 | `@esbuild/linux-arm64` | 0.25.12 | MIT | dev |  | ✗ |
| 44 | `@esbuild/linux-ia32` | 0.25.12 | MIT | dev |  | ✗ |
| 45 | `@esbuild/linux-loong64` | 0.25.12 | MIT | dev |  | ✗ |
| 46 | `@esbuild/linux-mips64el` | 0.25.12 | MIT | dev |  | ✗ |
| 47 | `@esbuild/linux-ppc64` | 0.25.12 | MIT | dev |  | ✗ |
| 48 | `@esbuild/linux-riscv64` | 0.25.12 | MIT | dev |  | ✗ |
| 49 | `@esbuild/linux-s390x` | 0.25.12 | MIT | dev |  | ✗ |
| 50 | `@esbuild/linux-x64` | 0.25.12 | MIT | dev |  | ✓ |
| 51 | `@esbuild/netbsd-arm64` | 0.25.12 | MIT | dev |  | ✗ |
| 52 | `@esbuild/netbsd-x64` | 0.25.12 | MIT | dev |  | ✗ |
| 53 | `@esbuild/openbsd-arm64` | 0.25.12 | MIT | dev |  | ✗ |
| 54 | `@esbuild/openbsd-x64` | 0.25.12 | MIT | dev |  | ✗ |
| 55 | `@esbuild/openharmony-arm64` | 0.25.12 | MIT | dev |  | ✗ |
| 56 | `@esbuild/sunos-x64` | 0.25.12 | MIT | dev |  | ✗ |
| 57 | `@esbuild/win32-arm64` | 0.25.12 | MIT | dev |  | ✗ |
| 58 | `@esbuild/win32-ia32` | 0.25.12 | MIT | dev |  | ✗ |
| 59 | `@esbuild/win32-x64` | 0.25.12 | MIT | dev |  | ✗ |
| 60 | `@eslint-community/eslint-utils` | 4.9.0 | MIT | dev |  | ✓ |
| 61 | `@eslint-community/regexpp` | 4.12.2 | MIT | dev |  | ✓ |
| 62 | `@eslint/config-array` | 0.21.1 | Apache-2.0 | dev |  | ✓ |
| 63 | `@eslint/config-helpers` | 0.4.2 | Apache-2.0 | dev |  | ✓ |
| 64 | `@eslint/core` | 0.17.0 | Apache-2.0 | dev |  | ✓ |
| 65 | `@eslint/eslintrc` | 3.3.3 | MIT | dev |  | ✓ |
| 66 | `@eslint/js` | 9.39.1 | MIT | dev | ✓ | ✓ |
| 67 | `@eslint/object-schema` | 2.1.7 | Apache-2.0 | dev |  | ✓ |
| 68 | `@eslint/plugin-kit` | 0.4.1 | Apache-2.0 | dev |  | ✓ |
| 69 | `@humanfs/core` | 0.19.1 | Apache-2.0 | dev |  | ✓ |
| 70 | `@humanfs/node` | 0.16.7 | Apache-2.0 | dev |  | ✓ |
| 71 | `@humanwhocodes/module-importer` | 1.0.1 | Apache-2.0 | dev |  | ✓ |
| 72 | `@humanwhocodes/retry` | 0.4.3 | Apache-2.0 | dev |  | ✓ |
| 73 | `@jridgewell/gen-mapping` | 0.3.13 | MIT | runtime |  | ✓ |
| 74 | `@jridgewell/remapping` | 2.3.5 | MIT | dev |  | ✓ |
| 75 | `@jridgewell/resolve-uri` | 3.1.2 | MIT | runtime |  | ✓ |
| 76 | `@jridgewell/sourcemap-codec` | 1.5.5 | MIT | runtime |  | ✓ |
| 77 | `@jridgewell/trace-mapping` | 0.3.31 | MIT | runtime |  | ✓ |
| 78 | `@mui/core-downloads-tracker` | 7.3.6 | MIT | runtime |  | ✓ |
| 79 | `@mui/icons-material` | 7.3.6 | MIT | runtime | ✓ | ✓ |
| 80 | `@mui/material` | 7.3.6 | MIT | runtime | ✓ | ✓ |
| 81 | `@mui/private-theming` | 7.3.6 | MIT | runtime |  | ✓ |
| 82 | `@mui/styled-engine` | 7.3.6 | MIT | runtime |  | ✓ |
| 83 | `@mui/system` | 7.3.6 | MIT | runtime |  | ✓ |
| 84 | `@mui/types` | 7.4.9 | MIT | runtime |  | ✓ |
| 85 | `@mui/utils` | 7.3.6 | MIT | runtime |  | ✓ |
| 86 | `@mui/x-date-pickers` | 8.19.0 | MIT | runtime | ✓ | ✓ |
| 87 | `@mui/x-internals` | 8.19.0 | MIT | runtime |  | ✓ |
| 88 | `@popperjs/core` | 2.11.8 | MIT | runtime |  | ✓ |
| 89 | `@rolldown/pluginutils` | 1.0.0-beta.47 | MIT | dev |  | ✓ |
| 90 | `@rollup/rollup-android-arm-eabi` | 4.53.3 | MIT | dev |  | ✗ |
| 91 | `@rollup/rollup-android-arm64` | 4.53.3 | MIT | dev |  | ✗ |
| 92 | `@rollup/rollup-darwin-arm64` | 4.53.3 | MIT | dev |  | ✗ |
| 93 | `@rollup/rollup-darwin-x64` | 4.53.3 | MIT | dev |  | ✗ |
| 94 | `@rollup/rollup-freebsd-arm64` | 4.53.3 | MIT | dev |  | ✗ |
| 95 | `@rollup/rollup-freebsd-x64` | 4.53.3 | MIT | dev |  | ✗ |
| 96 | `@rollup/rollup-linux-arm-gnueabihf` | 4.53.3 | MIT | dev |  | ✗ |
| 97 | `@rollup/rollup-linux-arm-musleabihf` | 4.53.3 | MIT | dev |  | ✗ |
| 98 | `@rollup/rollup-linux-arm64-gnu` | 4.53.3 | MIT | dev |  | ✗ |
| 99 | `@rollup/rollup-linux-arm64-musl` | 4.53.3 | MIT | dev |  | ✗ |
| 100 | `@rollup/rollup-linux-loong64-gnu` | 4.53.3 | MIT | dev |  | ✗ |
| 101 | `@rollup/rollup-linux-ppc64-gnu` | 4.53.3 | MIT | dev |  | ✗ |
| 102 | `@rollup/rollup-linux-riscv64-gnu` | 4.53.3 | MIT | dev |  | ✗ |
| 103 | `@rollup/rollup-linux-riscv64-musl` | 4.53.3 | MIT | dev |  | ✗ |
| 104 | `@rollup/rollup-linux-s390x-gnu` | 4.53.3 | MIT | dev |  | ✗ |
| 105 | `@rollup/rollup-linux-x64-gnu` | 4.53.3 | MIT | dev |  | ✓ |
| 106 | `@rollup/rollup-linux-x64-musl` | 4.53.3 | MIT | dev |  | ✓ |
| 107 | `@rollup/rollup-openharmony-arm64` | 4.53.3 | MIT | dev |  | ✗ |
| 108 | `@rollup/rollup-win32-arm64-msvc` | 4.53.3 | MIT | dev |  | ✗ |
| 109 | `@rollup/rollup-win32-ia32-msvc` | 4.53.3 | MIT | dev |  | ✗ |
| 110 | `@rollup/rollup-win32-x64-gnu` | 4.53.3 | MIT | dev |  | ✗ |
| 111 | `@rollup/rollup-win32-x64-msvc` | 4.53.3 | MIT | dev |  | ✗ |
| 112 | `@tanstack/query-core` | 5.90.11 | MIT | runtime |  | ✓ |
| 113 | `@tanstack/react-query` | 5.90.11 | MIT | runtime | ✓ | ✓ |
| 114 | `@types/babel__core` | 7.20.5 | MIT | dev |  | ✓ |
| 115 | `@types/babel__generator` | 7.27.0 | MIT | dev |  | ✓ |
| 116 | `@types/babel__template` | 7.4.4 | MIT | dev |  | ✓ |
| 117 | `@types/babel__traverse` | 7.28.0 | MIT | dev |  | ✓ |
| 118 | `@types/estree` | 1.0.8 | MIT | dev |  | ✓ |
| 119 | `@types/json-schema` | 7.0.15 | MIT | dev |  | ✓ |
| 120 | `@types/node` | 24.10.1 | MIT | dev | ✓ | ✓ |
| 121 | `@types/parse-json` | 4.0.2 | MIT | runtime |  | ✓ |
| 122 | `@types/prop-types` | 15.7.15 | MIT | runtime |  | ✓ |
| 123 | `@types/react` | 19.2.7 | MIT | runtime | ✓ | ✓ |
| 124 | `@types/react-dom` | 19.2.3 | MIT | dev | ✓ | ✓ |
| 125 | `@types/react-transition-group` | 4.4.12 | MIT | runtime |  | ✓ |
| 126 | `@typescript-eslint/eslint-plugin` | 8.48.1 | MIT | dev |  | ✓ |
| 127 | `@typescript-eslint/parser` | 8.48.1 | MIT | dev |  | ✓ |
| 128 | `@typescript-eslint/project-service` | 8.48.1 | MIT | dev |  | ✓ |
| 129 | `@typescript-eslint/scope-manager` | 8.48.1 | MIT | dev |  | ✓ |
| 130 | `@typescript-eslint/tsconfig-utils` | 8.48.1 | MIT | dev |  | ✓ |
| 131 | `@typescript-eslint/type-utils` | 8.48.1 | MIT | dev |  | ✓ |
| 132 | `@typescript-eslint/types` | 8.48.1 | MIT | dev |  | ✓ |
| 133 | `@typescript-eslint/typescript-estree` | 8.48.1 | MIT | dev |  | ✓ |
| 134 | `@typescript-eslint/utils` | 8.48.1 | MIT | dev |  | ✓ |
| 135 | `@typescript-eslint/visitor-keys` | 8.48.1 | MIT | dev |  | ✓ |
| 136 | `@vitejs/plugin-react` | 5.1.1 | MIT | dev | ✓ | ✓ |
| 137 | `acorn` | 8.15.0 | MIT | dev |  | ✓ |
| 138 | `acorn-jsx` | 5.3.2 | MIT | dev |  | ✓ |
| 139 | `ajv` | 6.12.6 | MIT | dev |  | ✓ |
| 140 | `ansi-styles` | 4.3.0 | MIT | dev |  | ✓ |
| 141 | `argparse` | 2.0.1 | Python-2.0 | dev |  | ✓ |
| 142 | `asynckit` | 0.4.0 | MIT | runtime |  | ✓ |
| 143 | `axios` | 1.13.2 | MIT | runtime | ✓ | ✓ |
| 144 | `babel-plugin-macros` | 3.1.0 | MIT | runtime |  | ✓ |
| 145 | `balanced-match` | 1.0.2 | MIT | dev |  | ✓ |
| 146 | `baseline-browser-mapping` | 2.8.32 | Apache-2.0 | dev |  | ✓ |
| 147 | `bootstrap` | 5.3.8 | MIT | runtime | ✓ | ✓ |
| 148 | `brace-expansion` | 1.1.12 | MIT | dev |  | ✓ |
| 149 | `brace-expansion` | 2.0.2 | MIT | dev |  | ✓ |
| 150 | `browserslist` | 4.28.0 | MIT | dev |  | ✓ |
| 151 | `call-bind-apply-helpers` | 1.0.2 | MIT | runtime |  | ✓ |
| 152 | `callsites` | 3.1.0 | MIT | runtime |  | ✓ |
| 153 | `caniuse-lite` | 1.0.30001759 | CC-BY-4.0 | dev |  | ✓ |
| 154 | `chalk` | 4.1.2 | MIT | dev |  | ✓ |
| 155 | `clsx` | 2.1.1 | MIT | runtime |  | ✓ |
| 156 | `color-convert` | 2.0.1 | MIT | dev |  | ✓ |
| 157 | `color-name` | 1.1.4 | MIT | dev |  | ✓ |
| 158 | `combined-stream` | 1.0.8 | MIT | runtime |  | ✓ |
| 159 | `concat-map` | 0.0.1 | MIT | dev |  | ✓ |
| 160 | `convert-source-map` | 1.9.0 | MIT | runtime |  | ✓ |
| 161 | `convert-source-map` | 2.0.0 | MIT | dev |  | ✓ |
| 162 | `cookie` | 1.1.1 | MIT | runtime |  | ✓ |
| 163 | `cosmiconfig` | 7.1.0 | MIT | runtime |  | ✓ |
| 164 | `cross-spawn` | 7.0.6 | MIT | dev |  | ✓ |
| 165 | `csstype` | 3.2.3 | MIT | runtime |  | ✓ |
| 166 | `date-fns` | 4.1.0 | MIT | runtime | ✓ | ✓ |
| 167 | `debug` | 4.4.3 | MIT | runtime |  | ✓ |
| 168 | `deep-is` | 0.1.4 | MIT | dev |  | ✓ |
| 169 | `delayed-stream` | 1.0.0 | MIT | runtime |  | ✓ |
| 170 | `dom-helpers` | 5.2.1 | MIT | runtime |  | ✓ |
| 171 | `dunder-proto` | 1.0.1 | MIT | runtime |  | ✓ |
| 172 | `electron-to-chromium` | 1.5.263 | ISC | dev |  | ✓ |
| 173 | `error-ex` | 1.3.4 | MIT | runtime |  | ✓ |
| 174 | `es-define-property` | 1.0.1 | MIT | runtime |  | ✓ |
| 175 | `es-errors` | 1.3.0 | MIT | runtime |  | ✓ |
| 176 | `es-object-atoms` | 1.1.1 | MIT | runtime |  | ✓ |
| 177 | `es-set-tostringtag` | 2.1.0 | MIT | runtime |  | ✓ |
| 178 | `esbuild` | 0.25.12 | MIT | dev |  | ✓ |
| 179 | `escalade` | 3.2.0 | MIT | dev |  | ✓ |
| 180 | `escape-string-regexp` | 4.0.0 | MIT | runtime |  | ✓ |
| 181 | `eslint` | 9.39.1 | MIT | dev | ✓ | ✓ |
| 182 | `eslint-plugin-react-hooks` | 7.0.1 | MIT | dev | ✓ | ✓ |
| 183 | `eslint-plugin-react-refresh` | 0.4.24 | MIT | dev | ✓ | ✓ |
| 184 | `eslint-scope` | 8.4.0 | BSD-2-Clause | dev |  | ✓ |
| 185 | `eslint-visitor-keys` | 3.4.3 | Apache-2.0 | dev |  | ✓ |
| 186 | `eslint-visitor-keys` | 4.2.1 | Apache-2.0 | dev |  | ✓ |
| 187 | `espree` | 10.4.0 | BSD-2-Clause | dev |  | ✓ |
| 188 | `esquery` | 1.6.0 | BSD-3-Clause | dev |  | ✓ |
| 189 | `esrecurse` | 4.3.0 | BSD-2-Clause | dev |  | ✓ |
| 190 | `estraverse` | 5.3.0 | BSD-2-Clause | dev |  | ✓ |
| 191 | `esutils` | 2.0.3 | BSD-2-Clause | dev |  | ✓ |
| 192 | `fast-deep-equal` | 3.1.3 | MIT | dev |  | ✓ |
| 193 | `fast-json-stable-stringify` | 2.1.0 | MIT | dev |  | ✓ |
| 194 | `fast-levenshtein` | 2.0.6 | MIT | dev |  | ✓ |
| 195 | `fdir` | 6.5.0 | MIT | dev |  | ✓ |
| 196 | `file-entry-cache` | 8.0.0 | MIT | dev |  | ✓ |
| 197 | `find-root` | 1.1.0 | MIT | runtime |  | ✓ |
| 198 | `find-up` | 5.0.0 | MIT | dev |  | ✓ |
| 199 | `flat-cache` | 4.0.1 | MIT | dev |  | ✓ |
| 200 | `flatted` | 3.3.3 | ISC | dev |  | ✓ |
| 201 | `follow-redirects` | 1.15.11 | MIT | runtime |  | ✓ |
| 202 | `form-data` | 4.0.5 | MIT | runtime |  | ✓ |
| 203 | `fsevents` | 2.3.3 | MIT | dev |  | ✗ |
| 204 | `function-bind` | 1.1.2 | MIT | runtime |  | ✓ |
| 205 | `gensync` | 1.0.0-beta.2 | MIT | dev |  | ✓ |
| 206 | `get-intrinsic` | 1.3.0 | MIT | runtime |  | ✓ |
| 207 | `get-proto` | 1.0.1 | MIT | runtime |  | ✓ |
| 208 | `glob-parent` | 6.0.2 | ISC | dev |  | ✓ |
| 209 | `globals` | 14.0.0 | MIT | dev |  | ✓ |
| 210 | `globals` | 16.5.0 | MIT | dev | ✓ | ✓ |
| 211 | `gopd` | 1.2.0 | MIT | runtime |  | ✓ |
| 212 | `graphemer` | 1.4.0 | MIT | dev |  | ✓ |
| 213 | `has-flag` | 4.0.0 | MIT | dev |  | ✓ |
| 214 | `has-symbols` | 1.1.0 | MIT | runtime |  | ✓ |
| 215 | `has-tostringtag` | 1.0.2 | MIT | runtime |  | ✓ |
| 216 | `hasown` | 2.0.2 | MIT | runtime |  | ✓ |
| 217 | `hermes-estree` | 0.25.1 | MIT | dev |  | ✓ |
| 218 | `hermes-parser` | 0.25.1 | MIT | dev |  | ✓ |
| 219 | `hoist-non-react-statics` | 3.3.2 | BSD-3-Clause | runtime |  | ✓ |
| 220 | `ignore` | 5.3.2 | MIT | dev |  | ✓ |
| 221 | `ignore` | 7.0.5 | MIT | dev |  | ✓ |
| 222 | `import-fresh` | 3.3.1 | MIT | runtime |  | ✓ |
| 223 | `imurmurhash` | 0.1.4 | MIT | dev |  | ✓ |
| 224 | `is-arrayish` | 0.2.1 | MIT | runtime |  | ✓ |
| 225 | `is-core-module` | 2.16.1 | MIT | runtime |  | ✓ |
| 226 | `is-extglob` | 2.1.1 | MIT | dev |  | ✓ |
| 227 | `is-glob` | 4.0.3 | MIT | dev |  | ✓ |
| 228 | `isexe` | 2.0.0 | ISC | dev |  | ✓ |
| 229 | `js-tokens` | 4.0.0 | MIT | runtime |  | ✓ |
| 230 | `js-yaml` | 4.1.1 | MIT | dev |  | ✓ |
| 231 | `jsesc` | 3.1.0 | MIT | runtime |  | ✓ |
| 232 | `json-buffer` | 3.0.1 | MIT | dev |  | ✓ |
| 233 | `json-parse-even-better-errors` | 2.3.1 | MIT | runtime |  | ✓ |
| 234 | `json-schema-traverse` | 0.4.1 | MIT | dev |  | ✓ |
| 235 | `json-stable-stringify-without-jsonify` | 1.0.1 | MIT | dev |  | ✓ |
| 236 | `json5` | 2.2.3 | MIT | dev |  | ✓ |
| 237 | `keyv` | 4.5.4 | MIT | dev |  | ✓ |
| 238 | `levn` | 0.4.1 | MIT | dev |  | ✓ |
| 239 | `lines-and-columns` | 1.2.4 | MIT | runtime |  | ✓ |
| 240 | `locate-path` | 6.0.0 | MIT | dev |  | ✓ |
| 241 | `lodash.merge` | 4.6.2 | MIT | dev |  | ✓ |
| 242 | `loose-envify` | 1.4.0 | MIT | runtime |  | ✓ |
| 243 | `lru-cache` | 5.1.1 | ISC | dev |  | ✓ |
| 244 | `math-intrinsics` | 1.1.0 | MIT | runtime |  | ✓ |
| 245 | `mime-db` | 1.52.0 | MIT | runtime |  | ✓ |
| 246 | `mime-types` | 2.1.35 | MIT | runtime |  | ✓ |
| 247 | `minimatch` | 3.1.2 | ISC | dev |  | ✓ |
| 248 | `minimatch` | 9.0.5 | ISC | dev |  | ✓ |
| 249 | `ms` | 2.1.3 | MIT | runtime |  | ✓ |
| 250 | `nanoid` | 3.3.11 | MIT | dev |  | ✓ |
| 251 | `natural-compare` | 1.4.0 | MIT | dev |  | ✓ |
| 252 | `node-releases` | 2.0.27 | MIT | dev |  | ✓ |
| 253 | `object-assign` | 4.1.1 | MIT | runtime |  | ✓ |
| 254 | `optionator` | 0.9.4 | MIT | dev |  | ✓ |
| 255 | `p-limit` | 3.1.0 | MIT | dev |  | ✓ |
| 256 | `p-locate` | 5.0.0 | MIT | dev |  | ✓ |
| 257 | `parent-module` | 1.0.1 | MIT | runtime |  | ✓ |
| 258 | `parse-json` | 5.2.0 | MIT | runtime |  | ✓ |
| 259 | `path-exists` | 4.0.0 | MIT | dev |  | ✓ |
| 260 | `path-key` | 3.1.1 | MIT | dev |  | ✓ |
| 261 | `path-parse` | 1.0.7 | MIT | runtime |  | ✓ |
| 262 | `path-type` | 4.0.0 | MIT | runtime |  | ✓ |
| 263 | `picocolors` | 1.1.1 | ISC | runtime |  | ✓ |
| 264 | `picomatch` | 4.0.3 | MIT | dev |  | ✓ |
| 265 | `postcss` | 8.5.6 | MIT | dev |  | ✓ |
| 266 | `prelude-ls` | 1.2.1 | MIT | dev |  | ✓ |
| 267 | `prop-types` | 15.8.1 | MIT | runtime |  | ✓ |
| 268 | `proxy-from-env` | 1.1.0 | MIT | runtime |  | ✓ |
| 269 | `punycode` | 2.3.1 | MIT | dev |  | ✓ |
| 270 | `react` | 19.2.0 | MIT | runtime | ✓ | ✓ |
| 271 | `react-dom` | 19.2.0 | MIT | runtime | ✓ | ✓ |
| 272 | `react-is` | 16.13.1 | MIT | runtime |  | ✓ |
| 273 | `react-is` | 19.2.0 | MIT | runtime |  | ✓ |
| 274 | `react-refresh` | 0.18.0 | MIT | dev |  | ✓ |
| 275 | `react-router` | 7.10.0 | MIT | runtime |  | ✓ |
| 276 | `react-router-dom` | 7.10.0 | MIT | runtime | ✓ | ✓ |
| 277 | `react-transition-group` | 4.4.5 | BSD-3-Clause | runtime |  | ✓ |
| 278 | `reselect` | 5.1.1 | MIT | runtime |  | ✓ |
| 279 | `resolve` | 1.22.11 | MIT | runtime |  | ✓ |
| 280 | `resolve-from` | 4.0.0 | MIT | runtime |  | ✓ |
| 281 | `rollup` | 4.53.3 | MIT | dev |  | ✓ |
| 282 | `scheduler` | 0.27.0 | MIT | runtime |  | ✓ |
| 283 | `semver` | 6.3.1 | ISC | dev |  | ✓ |
| 284 | `semver` | 7.7.3 | ISC | dev |  | ✓ |
| 285 | `set-cookie-parser` | 2.7.2 | MIT | runtime |  | ✓ |
| 286 | `shebang-command` | 2.0.0 | MIT | dev |  | ✓ |
| 287 | `shebang-regex` | 3.0.0 | MIT | dev |  | ✓ |
| 288 | `source-map` | 0.5.7 | BSD-3-Clause | runtime |  | ✓ |
| 289 | `source-map-js` | 1.2.1 | BSD-3-Clause | dev |  | ✓ |
| 290 | `strip-json-comments` | 3.1.1 | MIT | dev |  | ✓ |
| 291 | `stylis` | 4.2.0 | MIT | runtime |  | ✓ |
| 292 | `supports-color` | 7.2.0 | MIT | dev |  | ✓ |
| 293 | `supports-preserve-symlinks-flag` | 1.0.0 | MIT | runtime |  | ✓ |
| 294 | `tinyglobby` | 0.2.15 | MIT | dev |  | ✓ |
| 295 | `ts-api-utils` | 2.1.0 | MIT | dev |  | ✓ |
| 296 | `type-check` | 0.4.0 | MIT | dev |  | ✓ |
| 297 | `typescript` | 5.9.3 | Apache-2.0 | dev | ✓ | ✓ |
| 298 | `typescript-eslint` | 8.48.1 | MIT | dev | ✓ | ✓ |
| 299 | `undici-types` | 7.16.0 | MIT | dev |  | ✓ |
| 300 | `update-browserslist-db` | 1.1.4 | MIT | dev |  | ✓ |
| 301 | `uri-js` | 4.4.1 | BSD-2-Clause | dev |  | ✓ |
| 302 | `use-sync-external-store` | 1.6.0 | MIT | runtime |  | ✓ |
| 303 | `vite` | 7.2.6 | MIT | dev | ✓ | ✓ |
| 304 | `which` | 2.0.2 | ISC | dev |  | ✓ |
| 305 | `word-wrap` | 1.2.5 | MIT | dev |  | ✓ |
| 306 | `yallist` | 3.1.1 | ISC | dev |  | ✓ |
| 307 | `yaml` | 1.10.2 | ISC | runtime |  | ✓ |
| 308 | `yaml` | 2.8.2 | ISC | dev |  | ✓ |
| 309 | `yocto-queue` | 0.1.0 | MIT | dev |  | ✓ |
| 310 | `zod` | 4.1.13 | MIT | dev |  | ✓ |
| 311 | `zod-validation-error` | 4.0.2 | MIT | dev |  | ✓ |

</details>

## 8. How this report was produced

```bash
(cd backend && npm install) && (cd frontend && npm install)          # both: "up to date" (committed lockfiles)
npx @cyclonedx/cdxgen -t js -o sbom-backend.json  backend/
npx @cyclonedx/cdxgen -t js -o sbom-frontend.json frontend/
for p in backend frontend; do (cd $p &&
  npx license-checker-rseidelsohn --json --production > lic-$p-prod.json &&
  npx license-checker-rseidelsohn --json              > lic-$p-all.json); done
docker run --rm node:20-alpine sh -c 'apk add --no-cache dumb-init && apk list -I'
```

Post-processing: cdxgen writes absolute host paths into `cdx:npm:binPaths` properties. These were rewritten to repo-relative paths; nothing else in the SBOMs was changed.

Scope (runtime vs dev) comes from the npm lockfile flags (`dev`, `optional`, `devOptional`) and was cross-checked against the `--production` license-checker output. Don't rely on the CycloneDX `scope` field cdxgen emits for npm: it marks only direct dependencies as `required` and most transitive packages as `optional`, whatever their real scope. Dev packages carry the `cdx:npm:package:development=true` property in the SBOM.
