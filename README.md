# ATLAS

ATLAS is a self-extensible operating platform for supervised AI environments, managers, agents, and workflows. This bootstrap is a local-first control plane with real SQLite persistence and a repository-connected coding agent governed through ADA.

## Requirements

- Node.js 24 or newer
- A model-provider API key in `.env.local`

## Model providers

ATLAS supports a private local provider and three replaceable hosted providers:

| Provider | Configuration | Default model |
| --- | --- | --- |
| Ollama | `ATLAS_MODEL_PROVIDER=ollama` and `OLLAMA_BASE_URL=http://127.0.0.1:11434` | `qwen3:4b` |
| Groq | `ATLAS_MODEL_PROVIDER=groq` and `GROQ_API_KEY` | `openai/gpt-oss-20b` |
| OpenRouter | `ATLAS_MODEL_PROVIDER=openrouter` and `OPENROUTER_API_KEY` | `openrouter/free` |
| OpenAI | `ATLAS_MODEL_PROVIDER=openai` and `OPENAI_API_KEY` | `gpt-5.6-sol` |

Copy the relevant non-secret settings from `.env.example` into `.env.local`. Never commit `.env.local`.

Ollama is recommended when a suitable local model is installed because it keeps routine ATLAS inference private and avoids hosted request limits. Groq and OpenRouter remain optional hosted alternatives; configure them explicitly rather than enabling silent fallback.

## Launch

```powershell
npm install
npm run dev
```

Open <http://127.0.0.1:4310>. Provider selection, encrypted secret references, diagnostics, backups, and environment permissions are available under **Settings**; `.env.local` is only a bootstrap fallback.

### Open ATLAS from a phone on the same Wi-Fi

ATLAS only accepts connections from the computer by default. To make it
available to trusted devices on the same local network, launch it with
`ATLAS_HOST=0.0.0.0`, then open the computer's Wi-Fi IPv4 address and port
4310 on the phone. For example:

```powershell
$env:ATLAS_HOST="0.0.0.0"
npm run dev
```

This is local-network access, not an internet deployment. Keep ATLAS on a
trusted/private network and stop the server when LAN access is no longer
needed.

For a production-style local build:

```powershell
npm run build
npm start
```

## Bootstrap journey

1. Open **Environments** and connect **This computer**.
2. ATLAS discovers local capacity and creates exactly one dedicated Manager.
3. Open that Manager and describe a workflow in plain English.
4. The Manager creates the workflow and required agent profiles.
5. Run **Check real disk space** to exercise the permissioned tool broker, or deploy another temporary task.
6. Observe execution, results, cleanup, and audit events.
7. Ask **ADA** to delegate a platform change to its coding agent.
8. Review its proposed writes or checks under **Audit & approvals**.

## Architecture

- `src/server.ts` — local HTTP control plane and static dashboard server
- `src/atlas.ts` — environment, Manager, agent, workflow, memory, scheduling, HITL, and Development Assistant services
- `src/providers.ts` — replaceable model, execution, and browser provider boundaries
- `migrations/` — durable SQLite schema
- `public/` — real dashboard backed by application state
- `tests/` — core lifecycle tests
- `config/roadmap.json` — structured build order loaded by ATLAS and supplied to the Development Assistant

The Development Assistant view presents roadmap milestones with **Discuss** and **Start milestone** actions. These generate structured chat prompts automatically so platform development stays tied to repository-owned objectives and acceptance criteria.

ADA is the user-facing guide across ATLAS and can explain live state or prepare a governed handoff to an environment Manager or the Development Assistant. Operational agents never communicate directly with the user. Environment Managers are the operational reporting and supervision boundary. ADA's coding agent has no direct user interface and can only change ATLAS through repository-scoped actions and user-approved checks/writes; its reports return through ADA.

## Honest bootstrap limits

- The bundled execution backend is local. Cloud onboarding stores and health-checks a runtime endpoint, but a separately deployed remote runtime is not included.
- Browser automation is exposed as a provider boundary and shown as unconfigured until a browser provider is installed.
- Workflow observation is represented and persisted as a learning mode; recording desktop demonstrations requires a future OS-specific capture provider.
- Financial, messaging, and other business integrations are intentionally not hard-coded into the platform.
- The scheduler runs while the ATLAS process is running. Production always-on use requires running it as an OS service.

## Verification

```powershell
npm run check
npm run smoke
```
