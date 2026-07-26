# Bootstrap architecture

ATLAS uses a local control plane with durable SQLite state. Every environment has a database-enforced one-to-one Manager relationship. Managers own agent creation, workflow learning, scheduling, run supervision, recovery status, memory creation, reporting, and temporary-agent retirement.

Provider boundaries keep model generation, command execution, and browser operation replaceable. The model adapter supports OpenAI, Groq, and OpenRouter through their Responses-compatible APIs. Selection is configuration-driven, and provider credentials remain secret references rather than database values. The local execution provider exposes only an explicit verification-command allowlist to the Development Assistant.

The Development Assistant receives a repository inventory, creates structured actions, and requires HITL approval before writes or command execution. Paths are confined to the repository. Secrets are referenced through environment variables and excluded from source control.

State transitions and material actions are appended to the audit event table. Runs retain results or errors, and temporary agents are retired after terminal execution. The scheduler refreshes local health and starts due interval workflows.
