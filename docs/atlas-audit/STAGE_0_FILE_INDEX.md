# Stage 0 file index

## Top-level project files

- [package.json](../../package.json) — package metadata, scripts, and dependencies
- [README.md](../../README.md) — product overview and bootstrap narrative
- [tsconfig.json](../../tsconfig.json) — TypeScript compiler configuration
- [config/roadmap.json](../../config/roadmap.json) — roadmap milestone data

## Core runtime

- [src/server.ts](../../src/server.ts) — HTTP API and dashboard hosting
- [src/atlas.ts](../../src/atlas.ts) — orchestration service for environments, managers, runs, workflows, approvals, and jobs
- [src/actors.ts](../../src/actors.ts) — actors, skills, readiness, deployment, and health gates
- [src/registry.ts](../../src/registry.ts) — workforce and deployment registry
- [src/types.ts](../../src/types.ts) — shared runtime types
- [src/util.ts](../../src/util.ts) — helper utilities

## Persistence and migrations

- [src/db.ts](../../src/db.ts) — SQLite wrapper and migration runner
- [migrations/001_bootstrap.sql](../../migrations/001_bootstrap.sql) — initial schema
- [migrations/004_m1_execution.sql](../../migrations/004_m1_execution.sql) — execution-loop tables
- [migrations/005_m2_settings.sql](../../migrations/005_m2_settings.sql) — settings and permission tables
- [migrations/007_m4_browser_bridge.sql](../../migrations/007_m4_browser_bridge.sql) — browser bridge tables
- [migrations/010_v1_actors.sql](../../migrations/010_v1_actors.sql) — actor and deployment tables
- [migrations/011_workforce_registry.sql](../../migrations/011_workforce_registry.sql) — workforce registry tables
- [migrations/012_founder_workforce_one.sql](../../migrations/012_founder_workforce_one.sql) — founder bootstrap data

## Integrations and UI

- [src/providers.ts](../../src/providers.ts) — provider abstraction and execution backend
- [src/connector.ts](../../src/connector.ts) — connector and signed-command protocol
- [src/browser-bridge.ts](../../src/browser-bridge.ts) — browser bridge and approved-session control
- [src/observation.ts](../../src/observation.ts) — observation, draft, rehearsal, and approval workflows
- [src/settings.ts](../../src/settings.ts) — settings, secrets, permissions, diagnostics, and backups
- [public/index.html](../../public/index.html) and [public/app.js](../../public/app.js) — dashboard shell and client behavior
- [browser-extension/manifest.json](../../browser-extension/manifest.json) — browser extension manifest

## Tests

- [tests/atlas.test.ts](../../tests/atlas.test.ts)
- [tests/actors.test.ts](../../tests/actors.test.ts)
- [tests/browser-bridge.test.ts](../../tests/browser-bridge.test.ts)
- [tests/connector.test.ts](../../tests/connector.test.ts)
- [tests/observation.test.ts](../../tests/observation.test.ts)
- [tests/settings.test.ts](../../tests/settings.test.ts)
- [tests/registry.test.ts](../../tests/registry.test.ts)
