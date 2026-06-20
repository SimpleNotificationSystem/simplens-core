# Contributing to SimpleNS Core

Thank you for contributing to SimpleNS.

## Project Scope

This repository contains:

- Core notification orchestration service (`src/`)
- Admin dashboard (`dashboard/`)
- Supporting packages (`packages/`)
- Tests (`tests/`)
- Docker and local infra definitions (`docker-compose*.yaml`)

## Prerequisites

- Node.js 22+
- npm
- Docker + Docker Compose

## Local Setup

Recommended development paths:

- Use `.devcontainer` (preferred for easy dev setup without any clutter).
- Use `docker-compose.dev.yaml` for the full stack.
- Run app code locally only if MongoDB, Redis, and Kafka are available.
- Create the `simplens.config.yaml` file for any local development option below.
   - Refer the [Plugin Configuration Guide](https://www.simplens.in/docs/core/self-hosting#plugin-configuration) for manually creating `simplens.config.yaml` configuration file.
   - Or use the `@simplens/config-gen` tool to automatically generate the configuration for your required plugins.
      ```bash
      # Auto generates the plugin configuration for the official simplens mock plugin
      npx -y @simplens/config-gen@latest gen @simplens/mock
      
      ```

### Option A: Dev Container (Recommended)

1. Open the repository in the provided dev container (`.devcontainer/devcontainer.json`).
2. Let post-create scripts install dependencies automatically.
3. Start developing with local source mounted in the container.

### Option B: Docker Compose (`docker-compose.dev.yaml`)

Use when you want the full stack via Docker:

```bash
docker compose -f docker-compose.dev.yaml build
docker compose -f docker-compose.dev.yaml up -d
```

Note:

- Code changes are not always reflected automatically in containerized runtime images.
- Rebuild/restart relevant services after source changes when needed.

### Option C: Run Core Locally + Infra Services

If you prefer running Node processes directly on your machine:

1. Install dependencies:

```bash
npm install
cd dashboard && npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

```powershell
Copy-Item .env.example .env
```

3. Start required infrastructure (MongoDB, Kafka, Redis) via Docker:

- Set the env variable `INFRA_HOST=localhost` before starting the services in `docker-compose.infra.yaml`

```bash
docker compose -f docker-compose.infra.yaml up -d
```

## Development Commands

Core app:

```bash
npm run dev
```

Core worker/processors/recovery:

```bash
npm run worker:dev
npm run processor:dev
npm run delayed-processor:dev
npm run recovery:dev
```

Dashboard:

```bash
npm run dev --prefix dashboard
```

Build:

```bash
npm run build
```

## Code Quality Checks

Run these before opening a PR:

```bash
npm run lint:core
npm run lint:dashboard
npm run test
```

Additional test targets:

```bash
npm run test:unit
npm run test:integration
npm run test:coverage
```

Notes:

- A Husky `pre-push` hook runs `lint:core` and `lint:dashboard`.
- CI currently runs `npm ci` and `npm run test` for the core project.

## Contribution Workflow

1. Look into the open issues on [simplens-core issues](https://github.com/SimpleNotificationSystem/simplens-core/issues) and choose an issue you like to solve.
2. Create a new branch (`<type_of_issue>-<name>`) from the `development` branch.
3. Solve or complete the feature/bug mentioned in the issue.
4. Add or update tests for behavior changes.
5. Run lint + tests locally.
6. Open a PR with:
   - Clear problem statement
   - What changed and why
   - Testing evidence (commands and results)
   - Screenshots/GIFs for dashboard UI changes

## Commit Message Guidance

Prefer concise, intent-based commit messages. The release workflow groups changes using keywords such as:

- `feat`, `feature`, `add`, `new`, `implement`
- `fix`, `bug`, `resolve`, `patch`

Using these terms helps produce cleaner auto-generated release notes.

## Coding Conventions

- TypeScript is strict in core (`tsconfig.json` has `"strict": true`).
- Use existing path aliases where applicable (for example `@src/*` in core tests/code).
- Keep changes consistent with existing style and naming in touched modules.
- Avoid unrelated refactors in the same PR.

## Tests and Reliability Expectations

- Unit tests should cover new logic and edge cases.
- Integration tests should be added when changing API routes, data models, Kafka/Redis flows, or worker behavior.
- For bug fixes, include a regression test whenever practical.

## Security and Secrets

- Never commit secrets or real credentials.
- `.env` is gitignored; use `.env.example` as the template for required variables.
- If introducing new environment variables, document them in `.env.example` and relevant READMEs.

## Plugin and Package Changes

If your change touches `packages/*` or plugin-related loading/config behavior:

- Update package-level READMEs when behavior/CLI changes.
- Validate compatibility with `simplens.config.yaml` and runtime plugin loading paths.

## Documentation

Update docs with code changes when relevant:

- Root `README.md` for platform-level behavior
- `dashboard/README.md` for dashboard-specific behavior
- `api-docs/` Bruno collection when API contract changes
