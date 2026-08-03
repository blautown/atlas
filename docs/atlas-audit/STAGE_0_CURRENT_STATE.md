# Stage 0 current state

## Repository overview

ATLAS is a local-first control plane for managing environments, environment Managers, temporary agents, learned workflows, approvals, browser supervision, and actor-style operating work. The repository already contains a working runtime, SQLite persistence, a browser dashboard, a server API, provider abstractions, connector and browser bridge services, observation-based workflow learning, and a registry layer for workforce-oriented domain concepts.

The implementation is materially more complete than the bootstrap narrative alone suggests. The current codebase already supports onboarding environments, creating Managers, deploying temporary agents, executing permission-scoped disk-space work, learning workflows from observation, teaching Actor Skills, assessing Actor deployment readiness, and applying approvals and audit records.

## Detected technology stack

- Runtime: Node.js with ES modules in [package.json](../../package.json)
- Language: TypeScript in [tsconfig.json](../../tsconfig.json)
- Persistence: SQLite via [src/db.ts](../../src/db.ts) and the SQL migrations in [migrations](../../migrations)
- Server: native Node.js HTTP server in [src/server.ts](../../src/server.ts)
- UI: static browser dashboard in [public/index.html](../../public/index.html) and [public/app.js](../../public/app.js)
- Tests: Node.js test runner with TypeScript execution via [package.json](../../package.json)
- Browser extension: Manifest V3 extension in [browser-extension/manifest.json](../../browser-extension/manifest.json)

## Authoritative application entry points

- [src/server.ts](../../src/server.ts) — HTTP API surface and dashboard hosting
- [src/atlas.ts](../../src/atlas.ts) — orchestration service for environments, Managers, workflows, runs, approvals, and jobs
- [src/actors.ts](../../src/actors.ts) — actor lifecycle, routine tasks, skills, deployment readiness, and health gates
- [src/registry.ts](../../src/registry.ts) — company/business/workforce/position/operator/occupancy/loadout deployment registry
- [src/providers.ts](../../src/providers.ts) — model provider and execution backend abstractions
- [src/runtime.ts](../../src/runtime.ts) — outbound remote-runtime enrollment and command execution loop
- [public/app.js](../../public/app.js) — dashboard behaviors and routed UI actions

## Directory and package map

- [package.json](../../package.json) and [package-lock.json](../../package-lock.json): package metadata, scripts, and dev dependencies
- [src](../../src): runtime implementation split across orchestration, services, persistence, providers, connectors, browser bridge, observation, settings, and utilities
- [public](../../public): static dashboard assets and client-side UI logic
- [browser-extension](../../browser-extension): browser bridge extension assets
- [migrations](../../migrations): SQLite schema evolution for bootstrap, execution, settings, browser bridge, actors, and workforce registry
- [tests](../../tests): functional and integration tests covering core domains
- [config](../../config): roadmap data and assistant prompt documents
- [scripts](../../scripts): verification and smoke scripts

## Routed page and UI map

The dashboard in [public/app.js](../../public/app.js) exposes these navigable views and entry points:

- Overview: system capacity, activity, jobs, and roadmap prompts
- Environments: environment onboarding, remote enrollment, and Manager status
- Workforce: actor creation, skills, readiness assessment, deployment, and supervision
- Browser: session pairing, approved tab control, and browser actions
- Development: roadmap actions and ADA coding-agent delegation
- Governance: approvals, observation sessions, and audit visibility
- Settings: provider selection, secrets, permissions, diagnostics, and backups

The UI uses a single-page view model with delegated handlers for approvals, observation stop, browser revocation, secret rotation, run control, workflow control, actor skill rehearsal, deployment configuration, health gates, and deployment assessment.

## State-management approach

ATLAS uses a service-oriented model with a central database-backed state store:

- [src/atlas.ts](../../src/atlas.ts) exposes Atlas.state() and coordinates state aggregation across services.
- [src/actors.ts](../../src/actors.ts) maintains actor state plus deployment manifests, capability snapshots, capacity snapshots, environmental skills, and deployment task bindings.
- [src/registry.ts](../../src/registry.ts) exposes registry state for companies, businesses, workforces, cells, positions, operators, loadouts, and deployments.
- [src/observation.ts](../../src/observation.ts) maintains workflow drafts, rehearsals, and approvals.
- [src/browser-bridge.ts](../../src/browser-bridge.ts) and [src/connector.ts](../../src/connector.ts) maintain browser and environment connector state.
- [src/settings.ts](../../src/settings.ts) manages model-role settings, secret references, environment permissions, backups, and diagnostics.

The UI consumes these service views through server routes such as /api/state, /api/registry, /api/actors, /api/connectors, /api/browser, and /api/settings from [src/server.ts](../../src/server.ts).

## Persistence and database map

The database wrapper in [src/db.ts](../../src/db.ts) creates SQLite files under data/atlas.db (or ATLAS_DB_PATH) and applies all SQL migrations from [migrations](../../migrations) in filename order.

The authoritative persistence surfaces include tables for:

- environments, managers, agents, workflows, runs, approvals, audit_events, messages, conversations, assistant_jobs
- actors, actor_goals, actor_outcomes, actor_routine_tasks, actor_skills, actor_skill_versions, actor_deployments, deployment_manifests, deployment_task_bindings, actor_health_gates
- companies, businesses, workforces, workforce_cells, workforce_positions, workforce_operators, position_occupancies, loadouts, workforce_loadouts, workforce_deployments
- browser sessions, browser commands, browser events, observation sessions, workflow drafts, workflow rehearsals, connector commands, connector events, and environment devices

## Migrations

The migration lineage is visible in the SQL files:

- [migrations/001_bootstrap.sql](../../migrations/001_bootstrap.sql): baseline environments, managers, agents, workflows, runs, approvals, memory, audit, conversations, and messages
- [migrations/004_m1_execution.sql](../../migrations/004_m1_execution.sql): execution loop tables, run controls, artifacts, events, and job state
- [migrations/005_m2_settings.sql](../../migrations/005_m2_settings.sql): platform settings, secret references, environment permissions, backups, diagnostics tables
- [migrations/007_m4_browser_bridge.sql](../../migrations/007_m4_browser_bridge.sql): browser pair tokens, sessions, commands, events, and nonce protections
- [migrations/010_v1_actors.sql](../../migrations/010_v1_actors.sql): actor lifecycle, skills, deployment manifests, health gates, environmental skills, and deployment bindings
- [migrations/011_workforce_registry.sql](../../migrations/011_workforce_registry.sql): founder/company/workforce/position/operator/loadout/occupancy registry tables
- [migrations/012_founder_workforce_one.sql](../../migrations/012_founder_workforce_one.sql): seeded founder company and Workforce 1 operational registry entries

## Service map

- [src/atlas.ts](../../src/atlas.ts): Atlas orchestration and job management
- [src/actors.ts](../../src/actors.ts): actor and deployment domain service
- [src/registry.ts](../../src/registry.ts): workforce and deployment registry service
- [src/connector.ts](../../src/connector.ts): remote environment connector service
- [src/browser-bridge.ts](../../src/browser-bridge.ts): browser bridge and consent-based session service
- [src/observation.ts](../../src/observation.ts): workflow observation, draft, rehearsal, and approval service
- [src/settings.ts](../../src/settings.ts): provider, secret, permissions, diagnostics, and backup service
- [src/tool-broker.ts](../../src/tool-broker.ts): permissioned local tool execution broker

## API and connector surfaces

The HTTP API in [src/server.ts](../../src/server.ts) exposes routes for:

- state, registry, environments, actors, runs, workflows, approvals, observations, browser pairings/sessions/commands, connectors, settings, and ADA/manager chat
- actor-specific operations such as goals, outcomes, routine tasks, skills, rehearsals, assessments, deployment configuration, health gates, and proactive escalation
- registry operations such as companies, businesses, workforces, cells, positions, operators, occupancies, loadouts, workforce-loadout attachments, and deployments

Remote connector surfaces are implemented in [src/connector.ts](../../src/connector.ts) and [src/runtime.ts](../../src/runtime.ts). They use outbound-only HTTP polling, device authentication, signed commands, replay protection, and revocation handling.

## Execution and workflow flow

Execution is driven by Atlas.deploy(), Atlas.deployDiskSpace(), Atlas.executeRun(), Atlas.executeDiskSpaceRun(), and the run-control methods in [src/atlas.ts](../../src/atlas.ts). The flow is:

1. Create a temporary agent through createAgent()
2. Record a run and run control state
3. Execute either generic work or the permissioned disk-space broker workflow
4. Capture evidence and verification artifacts
5. Retire the temporary agent on terminal completion or failure
6. Log run events and audit entries

Workflow creation is separate from actor skill deployment. Learned workflows can be created from observation drafts and then approved before becoming enabled workflows.

## Provider abstraction and model integrations

Model and execution abstractions are defined in [src/types.ts](../../src/types.ts) and implemented in [src/providers.ts](../../src/providers.ts):

- ResponsesApiProvider for OpenAI-compatible provider APIs such as Groq, OpenRouter, and OpenAI
- OllamaProvider for a local model endpoint with structured-output support and thinking disabled
- LocalExecutionBackend for local capacity inspection and allowed command execution
- UnconfiguredBrowserProvider as a placeholder browser-provider interface

The runtime selects provider roles in [src/server.ts](../../src/server.ts) from settings and applies them to Atlas.model and Atlas.adaModel.

## Streaming and structured-output support

The code currently does not implement a streaming UI or streaming token channel. Instead, it uses explicit request/response generation with structured schema validation. Evidence is visible in:

- [src/providers.ts](../../src/providers.ts): the ResponsesApiProvider sends a JSON-schema format payload when jsonSchema is supplied, and the OllamaProvider sends format: request.jsonSchema with stream: false
- [src/atlas.ts](../../src/atlas.ts): the manager, ADA, developer, and inspection prompts rely on structured JSON schemas for model responses

This is structured-output oriented rather than streaming-first.

## Embeddings and context handling

The repository does not show an embeddings subsystem, vector store, or retrieval-augmented generation pipeline. Context handling is prompt-based and assembled directly in [src/atlas.ts](../../src/atlas.ts):

- live state is serialized into the prompt context
- recent message history is appended
- repository inventory and selected files are included for coding-agent tasks
- the current prompt is sent alongside the system instruction and any JSON schema

## Environment model

Environments are represented in the database and state model through [src/atlas.ts](../../src/atlas.ts), [src/server.ts](../../src/server.ts), and [migrations/001_bootstrap.sql](../../migrations/001_bootstrap.sql). A local environment can be onboarded and paired with exactly one Manager; remote environments can be enrolled with the connector protocol.

## Manager model

Managers are created as a one-to-one relationship with an environment and support conversation, workflow learning, agent creation, run supervision, recovery state, audit records, and environment-specific capabilities. The Manager record is created in [src/atlas.ts](../../src/atlas.ts) during environment onboarding and used throughout the connector and browser bridge services.

## Actor, agent, operator, position, persona and identity concepts

- Actors: persistent global identities with profile fields, goals, outcomes, routine tasks, and skills in [src/actors.ts](../../src/actors.ts) and [migrations/010_v1_actors.sql](../../migrations/010_v1_actors.sql)
- Agents: environment-scoped runtime workers with persistent or temporary lifecycle semantics in [src/atlas.ts](../../src/atlas.ts) and [migrations/001_bootstrap.sql](../../migrations/001_bootstrap.sql)
- Operators: workforce registry actors in [src/registry.ts](../../src/registry.ts) and [migrations/011_workforce_registry.sql](../../migrations/011_workforce_registry.sql)
- Positions: workforce-role slots with permitted operator kinds and authority policy in [src/registry.ts](../../src/registry.ts)
- Persona and identity: represented by actor fields such as identity, personality, and relationship in [src/actors.ts](../../src/actors.ts)

## Business, workforce, organisation, department, team and cell concepts

The workforce registry in [src/registry.ts](../../src/registry.ts) and [migrations/011_workforce_registry.sql](../../migrations/011_workforce_registry.sql) introduces:

- companies and founder company bootstrap
- businesses and workforce-business assignments
- workforces and workforce cells
- positions and position occupancies
- loadouts and workforce loadouts
- workforce deployments

The seeded founder data in [migrations/012_founder_workforce_one.sql](../../migrations/012_founder_workforce_one.sql) creates Founder Company and Workforce 1 as concrete registry entries.

## Skills, dependencies, sessions and credentials

- Skills: actor skills plus skill versions and templates in [src/actors.ts](../../src/actors.ts) and [migrations/010_v1_actors.sql](../../migrations/010_v1_actors.sql)
- Dependencies: encoded in skill version dependencies_json and evaluated as capability, capacity, configuration, environmental skill, or user action requirements in ActorService.classifyDependency()
- Sessions: browser and observation sessions in [src/browser-bridge.ts](../../src/browser-bridge.ts) and [src/observation.ts](../../src/observation.ts)
- Credentials: secret references and encrypted secret handling in [src/settings.ts](../../src/settings.ts)

## Schedules and routine-task handling

Routine tasks are created and stored in [src/actors.ts](../../src/actors.ts). The service can compile schedule versions, approve them, and track the latest schedule state. The current implementation uses natural-language timing text plus a schedule version record rather than a full cron-like DSL.

## Approval and audit mechanisms

Approvals are stored in the approvals table and resolved through Atlas.resolveApproval() in [src/atlas.ts](../../src/atlas.ts). The same service writes audit entries for environment onboarding, workflow creation, actor operations, connector events, browser events, observation events, and approval actions. The audit trail is a core cross-cutting mechanism rather than an optional feature.

## Health, restart and recovery mechanisms

- Health: environment health is stored in environment health_json and capability/capacity snapshots; actor deployments use health gates and readiness manifests in [src/actors.ts](../../src/actors.ts)
- Restart: [src/settings.ts](../../src/settings.ts) exposes restart as unavailable with an explicit M9 explanation
- Recovery: [src/atlas.ts](../../src/atlas.ts) supports paused, cancelled, retried, and failed runs; the connector runtime buffers telemetry and reconnects via [src/runtime.ts](../../src/runtime.ts)

## Tests and fixtures

The test suite under [tests](../../tests) covers:

- actor lifecycle and deployment readiness
- Atlas orchestration and disk-space workflow
- browser bridge and connector behavior
- observation workflow learning and approvals
- workforce registry and founder bootstrap
- settings, secrets, diagnostics, and backup operations

The tests mostly use in-process SQLite fixtures and fake providers rather than full end-to-end browser or remote runtime instances.

## Deployment and configuration

- [README.md](../../README.md) describes bootstrap, local launch, remote runtime, active browser bridge, and verification commands
- [config/roadmap.json](../../config/roadmap.json) contains the structured roadmap that Atlas loads into the Development Assistant context
- [config/ada.md](../../config/ada.md), [config/manager.md](../../config/manager.md), and [config/coding-agent.md](../../config/coding-agent.md) provide role-specific prompts and guardrails
- [src/settings.ts](../../src/settings.ts) provides runtime model-role configuration, secret references, permissions, and backup controls

## Incomplete, mocked or placeholder areas

- No embeddings or vector store is implemented.
- The browser provider interface is present but unconfigured in [src/providers.ts](../../src/providers.ts).
- The runtime supports an outbound connector loop but not a full multi-user authenticated remote control plane.
- Restart and in-place recovery remain explicitly unavailable in the current settings UI.
- The smoke script in [scripts/smoke.mjs](../../scripts/smoke.mjs) currently expects a running server and therefore depends on runtime availability.

## Embedded architectural assumptions

The current codebase assumes:

- one environment has one dedicated Manager
- actors are global identities and deployments are environment-specific
- the dashboard is the main user entry point
- approvals are mandatory for sensitive development changes and workflow autonomy
- connector/browser communication is outbound-only and signed
- provider choice is configurable but not yet fully tiered by role in a formal capability model

## Verified unknowns

The following items remain uncertain from the repository inspection alone:

- whether the current browser and connector surfaces are fully exercised in real hardware beyond the automated tests
- whether the current model-role tiering is fully enforced beyond configuration persistence
- whether any external model provider credentials were configured in this environment during the audit
- whether the current smoke script is intended to be run against a live server or a fixture-managed process
