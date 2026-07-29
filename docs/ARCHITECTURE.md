# Bootstrap architecture

ATLAS uses a local control plane with durable SQLite state. Every environment has a database-enforced one-to-one Manager relationship. Managers own agent creation, workflow learning, scheduling, run supervision, recovery status, memory creation, reporting, and temporary-agent retirement.

Actors are global persistent identities rather than environment-owned agents. An Actor owns a profile, goals, measurable intended outcomes, natural-language Routine Tasks, and independently versioned Skills. A deployment binds one Actor to one Environment Manager at a time. The Manager compiles exact schedules, evaluates live dependencies, activates ready tasks, and retains explicit blockers for partial deployment.

Environment capability and operational capacity are separate evidence streams. Concrete configurations and encrypted secret references belong to a deployment. Environmental Skill definitions may be reused, but proof and health gates are scoped to one Manager in one environment. Workflows remain operational mechanisms for Managers and temporary agents; they are not part of the Actor Routine model.

Provider boundaries keep model generation, command execution, and browser operation replaceable. The model adapter supports OpenAI, Groq, and OpenRouter through their Responses-compatible APIs. Selection is configuration-driven, and provider credentials remain secret references rather than database values. The local execution provider exposes only an explicit verification-command allowlist to the Development Assistant.

The Development Assistant receives a repository inventory, creates structured actions, and requires HITL approval before writes or command execution. Paths are confined to the repository. Secrets are referenced through environment variables and excluded from source control.

State transitions and material actions are appended to the audit event table. Runs retain results or errors, and temporary agents are retired after terminal execution. The scheduler refreshes local health and starts due interval workflows.


## Secure environment connector

Remote environments use an outbound-only HTTP polling protocol designed for HTTPS transport. Enrollment tokens are single-use and short-lived. Each runtime generates an Ed25519 device identity; requests are signed with timestamped nonces, and the control plane signs expiring, capability-scoped commands with its own persistent key. SQLite uniqueness constraints make telemetry idempotent across reconnects. Revocation disables the device, cancels pending commands, and marks its dedicated Manager offline. No inbound runtime debugging port is opened.


## Active browser bridge

The Manifest V3 browser extension establishes a separate outbound, tab-scoped session after a user supplies a short-lived one-time pairing token. It generates its own Ed25519 identity and signs every poll and event batch. Browser commands are allowlisted, durable, Manager-owned, and limited to the consented tab ID. The extension requests no cookie permission, filters downloads to the approved tab origin, blocks sensitive-field typing, masks sensitive fields in screenshots, and redacts observations again at the control plane. Disconnect or revocation invalidates authentication and cancels pending commands immediately.
