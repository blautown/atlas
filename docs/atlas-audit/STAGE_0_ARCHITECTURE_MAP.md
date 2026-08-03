# Stage 0 architecture map

## System purpose

ATLAS is a local-first control plane for environment onboarding, workflow execution, approvals, observation-driven workflow learning, browser supervision, and workforce-style actor deployment. The implementation is split between a central orchestration service, a database-backed state store, provider integrations, and a browser-facing dashboard.

## Primary runtime layers

### 1. Control plane

- [src/server.ts](../../src/server.ts) is the HTTP entry point and API surface.
- [src/atlas.ts](../../src/atlas.ts) is the core orchestrator for environments, managers, agents, workflows, runs, approvals, and audit events.
- The server routes expose state, registry, environment, actor, browser, connector, observation, and settings operations to the dashboard.

### 2. Domain services

- [src/actors.ts](../../src/actors.ts) manages actor identities, goals, routine tasks, skills, deployment readiness, environmental-skill proofs, and health gates.
- [src/registry.ts](../../src/registry.ts) models companies, businesses, workforces, cells, positions, operators, occupancies, loadouts, and deployments.
- [src/observation.ts](../../src/observation.ts) captures observed browser actions, turns them into workflow drafts, and supports rehearsal and approval.

### 3. Integration and infrastructure surfaces

- [src/providers.ts](../../src/providers.ts) provides the provider abstraction for model APIs and execution backends.
- [src/connector.ts](../../src/connector.ts) and [src/runtime.ts](../../src/runtime.ts) implement the remote-environment connector and signed-command lifecycle.
- [src/browser-bridge.ts](../../src/browser-bridge.ts) handles browser-session pairing, redaction, approved commands, event ingestion, and revocation.
- [src/settings.ts](../../src/settings.ts) stores provider selection, secret references, permissions, diagnostics, and backup state.

### 4. Persistence and migrations

- [src/db.ts](../../src/db.ts) wraps SQLite and applies the SQL migrations in [migrations](../../migrations).
- The migrations layer evolves the schema from bootstrap state through execution, settings, browser bridge, actors, and workforce registry features.

## Runtime flow

1. The dashboard calls the HTTP API in [src/server.ts](../../src/server.ts).
2. The server dispatches requests to the Atlas orchestration service in [src/atlas.ts](../../src/atlas.ts).
3. Atlas uses domain services and the database wrapper to read or write state.
4. Provider-backed prompts, connector commands, browser events, and workflow drafts flow through the service layer and are persisted as audit evidence.
5. Tests exercise the orchestration and integration boundaries through the suite under [tests](../../tests).

## State model

The repository uses a service-oriented state model with durable persistence rather than an in-memory runtime. Core state domains include:

- environment and manager records
- agents, runs, workflows, approvals, and audit events
- actor profiles, goals, routine tasks, skills, deployment manifests, and health gates
- workforce registry entities such as company, business, workforce, cell, position, operator, loadout, and deployment
- browser and connector sessions with consent and revocation state

## Architectural strengths

- Strong separation between orchestration, domain services, integrations, and persistence
- Clear evidence-oriented runtime behavior with approvals and audit logging
- A test suite that exercises most of the core runtime layers
- A dashboard and browser-extension surface that are already wired to the server-side services

## Architectural caveats

- The system is not a full multi-tenant SaaS platform; it is a local-first control plane with a single-node persistence model.
- The model-provider layer is configurable but not yet fully formalized as a capability-tiering system.
- The browser and connector surfaces are implemented, but the audit did not find evidence of a broad external deployment footprint beyond the repository tests.
