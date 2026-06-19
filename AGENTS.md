# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the TypeScript core service. HTTP routes live in `src/api/`, background execution in `src/workers/` and `src/processors/`, channel integrations in `src/plugins/`, and shared infrastructure in `src/config/`, `src/database/`, and `src/utils/`.

Tests are split between `tests/unit` and `tests/integration`, with helpers in `tests/testutil` and setup in `tests/setup.ts`. The Next.js admin UI lives in `dashboard/`. Docs and assets are in `api-docs/`, `architecture/`, and `assets/`.

## Build, Test, and Development Commands
Install dependencies with `npm install` and `npm install --prefix dashboard`.

- `npm run dev` starts the core API with `tsx` and `nodemon`.
- `npm run worker:dev`, `npm run processor:dev`, `npm run delayed-processor:dev`, and `npm run recovery:dev` start background services.
- `npm run build` compiles `src/` to `dist/` and rewrites path aliases.
- `npm run start` runs the compiled API from `dist/api/server.js`.
- `npm run test`, `npm run test:unit`, `npm run test:integration`, and `npm run test:coverage` run tests.
- `npm run lint:core` checks the core codebase; `npm run lint:dashboard` checks the dashboard.
- `npm run dev --prefix dashboard` starts the dashboard on port `3002`.

## Coding Style & Naming Conventions
Use TypeScript with strict typing and existing `@src/*` path aliases. Match current style: 2-space indentation, camelCase for variables and functions, PascalCase for types, classes, and React components, and filenames such as `notification.controller.test.ts`.

Plan changes before writing code. Follow low-level design principles: single responsibility, clear interfaces, useful dependency inversion, and explicit error handling. Do not duplicate logic; extract shared behavior into focused utilities, services, or test helpers.

## Testing Guidelines
Vitest is the test runner. Integration tests also use `supertest`, `mongodb-memory-server`, and Redis mocks. Name test files with `.test.ts`, for example `tests/unit/plugins/loader.test.ts`.

Every new feature or code path must include matching tests in `tests/`. Add unit suites for isolated logic and integration suites for API, persistence, plugin, processor, or worker behavior.

## Commit & Pull Request Guidelines
Use short Conventional Commit style messages such as `feat: add email retry policy`, `fix: handle missing template`, or `docs: update setup notes`. Keep commits focused.

PRs should include a summary, linked issue when applicable, test evidence, and screenshots or GIFs for `dashboard/` UI changes. Husky `pre-push` runs both lint commands.

## Security & Configuration Tips
Do not commit secrets. Use `.env.example` as the template for `.env`, and update it when adding configuration. For local full-stack work, prefer `docker-compose.dev.yaml`; for core-only work, start infrastructure with `docker compose -f docker-compose.infra.yaml up -d`.
