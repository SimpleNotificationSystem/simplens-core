# SimpleNS Flaws Report

Date: 2026-04-13
Scope: `simplens-core` (core API, packages, dashboard, and tests)
Method: build/lint/test runs + targeted static review

## Summary

- Core lint: pass
- Core build: pass
- Core tests: pass (27/27 files)
- Dashboard lint: pass
- Root dependency audit: pass (0 vulnerabilities)

## Remediation Status

1. Command injection in plugin auto-install: fixed
2. Command injection in config generator: fixed
3. Unauthenticated admin-channel test endpoint: fixed
4. Overly permissive CORS policy: fixed
5. Cross-platform local config path bug: fixed
6. Integration test brittleness/timeouts: mitigated (external DB fallback + increased DB startup hook timeout)
7. Hardcoded Grafana default password: fixed
8. Dependency vulnerabilities: fixed via package upgrades/audit fix

## Findings

### 1) Command injection risk in plugin auto-install

- Severity: Critical
- Location: `src/plugins/loader/loader.ts:71`
- Evidence: Uses shell command interpolation with package names from config:
  - `execSync(`npm install ${pkg}`, ...)`
- Why this is a flaw:
  - `pkg` comes from config and is not validated/sanitized.
  - Shell metacharacters can execute arbitrary commands.
- Impact:
  - Remote code execution on host where SimpleNS runs if config is attacker-controlled.

### 2) Command injection risk in config generator CLI

- Severity: Critical
- Location: `packages/config-gen/src/generator.ts:50`
- Evidence:
  - `execSync(`npm install ${packages.join(' ')}`, ...)`
- Why this is a flaw:
  - Package names are passed into a shell command as one interpolated string.
  - Malicious package tokens can break out of expected command behavior.
- Impact:
  - Arbitrary command execution when CLI input is untrusted.

### 3) Unauthenticated admin-channel test endpoint can trigger outbound actions

- Severity: High
- Locations:
  - `src/api/server.ts:52`
  - `src/api/routes/admin-channels.routes.ts:16`
  - `src/api/controllers/admin-channel.controller.ts:57`
- Evidence:
  - Route is mounted without auth middleware.
  - `POST /api/admin-channels/test` calls provider `testConnection()` using user input config.
- Why this is a flaw:
  - Anyone who can reach the API can trigger test sends/outbound network calls.
- Impact:
  - Abuse for message spam, SSRF-like outbound probing, and operational noise/cost.

### 4) Overly permissive CORS policy on API

- Severity: Medium
- Location: `src/api/server.ts:32`
- Evidence:
  - `app.use(cors({ origin: "*" }));`
- Why this is a flaw:
  - Any web origin can call API endpoints from browser context.
  - Increases attack surface when tokens are leaked or exposed in client-side contexts.
- Impact:
  - Easier cross-origin abuse patterns and weaker perimeter control.

### 5) Cross-platform path bug in local config discovery

- Severity: Medium
- Location: `src/plugins/loader/loader.ts:126`
- Evidence:
  - Uses `lastIndexOf('/')` to derive directory path.
- Why this is a flaw:
  - On Windows paths use `\\`; this logic can fail to detect sibling config files.
- Impact:
  - Plugin loader may miss local `simplens.config.*`, causing inconsistent behavior between OSes.

### 6) Integration tests are brittle/offline-hostile

- Severity: Medium
- Locations:
  - `tests/utils/db.ts:20`
  - Test run output shows `Could NOT download https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.24.zip! read ECONNRESET`
- Evidence:
  - `MongoMemoryReplSet.create(...)` requires runtime binary availability.
  - Reproducible hook timeout failures in integration suites.
- Impact:
  - CI and developer test runs fail under restricted/no-network environments.

### 7) Default Grafana admin password hardcoded in generated infra template

- Severity: Medium
- Location: `packages/onboard/src/infra.ts:178`
- Evidence:
  - `GF_SECURITY_ADMIN_PASSWORD=admin`
- Why this is a flaw:
  - Static default credentials increase risk when users deploy defaults.
- Impact:
  - Unauthorized dashboard access in misconfigured deployments.

## Automated Check Output Highlights

### Test status

- `npm test`: passed
- Test files: 27 passed
- Tests: 376 passed, 9 skipped

### Security audit summary

- `npm audit --json` result:
  - Total vulnerabilities: 0

## Reproduction Commands

Run from repo root:

```powershell
npm install
npm run lint:core
npm run build
npm test
npm install --prefix dashboard
npm run lint --prefix dashboard
npm audit --json
```

## Fix Priority Order

1. Patch command-injection vectors in `loader` and `config-gen`
2. Put auth on `admin-channels` routes (especially `/test`)
3. Restrict CORS origins to trusted dashboard/admin hosts
4. Fix Windows path handling in loader config discovery
5. Stabilize integration tests (pin/preload MongoDB binary or fallback strategy)
6. Remove hardcoded Grafana default password and force unique secret generation
7. Upgrade vulnerable dependencies and regenerate lockfiles
