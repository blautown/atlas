# ATLAS

ATLAS is a self-extensible operating platform for persistent Actors, supervised AI environments, Managers, temporary agents, and operational workflows. Actors are created globally with profiles, goals, intended outcomes, Routine Tasks, and taught Skills before an Environment Manager assesses them for deployment.

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

Open <http://127.0.0.1:4310>. Role-specific provider selection, encrypted secret references, diagnostics, backups, and environment permissions are available under **Settings**; `.env.local` is only a bootstrap fallback. ADA and its coding agent can use a different model from environment Managers and task agents.

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
3. Create an Actor profile and define its goals, intended outcomes, and natural-language Routine Tasks.
4. Teach and safely rehearse the Actor Skills required by those tasks.
5. Select an environment. Its Manager compares live capabilities and operational capacity, proves required environmental skills, and produces a deployment-readiness manifest.
6. Activate ready tasks; blocked tasks remain explicit and required blockers mark the Actor degraded.
7. Run **Check real disk space** to exercise the permissioned temporary-agent loop, or ask **ADA** to delegate a platform change to its coding agent.
8. Review health, outcomes, Manager escalations, and governed actions under **Audit & approvals**.

## Architecture

- `src/server.ts` — local HTTP control plane and static dashboard server
- `src/atlas.ts` — environment, Manager, agent, workflow, memory, scheduling, HITL, and Development Assistant services
- `src/actors.ts` — Actor profiles, routines, Skills, environment readiness, deployment manifests, health gates, and Actor communication
- `src/providers.ts` — replaceable model, execution, and browser provider boundaries
- `migrations/` — durable SQLite schema
- `public/` — real dashboard backed by application state
- `tests/` — core lifecycle tests
- `config/roadmap.json` — structured build order loaded by ATLAS and supplied to the Development Assistant

The Development Assistant view presents roadmap milestones with **Discuss** and **Start milestone** actions. These generate structured chat prompts automatically so platform development stays tied to repository-owned objectives and acceptance criteria.

The user directly faces ADA, the Development Assistant, Environment Managers, and Actors. Temporary operational agents never communicate directly with the user. A supervised Actor may answer a user-initiated conversation, but proactive messages and operational escalations route through its Environment Manager. ADA's coding agent can only change ATLAS through repository-scoped actions and user-approved checks/writes.

## Remote environment runtime

From **Environments**, create a secure remote enrollment. On the target computer, install or clone this ATLAS package, run `npm install && npm run build`, then use the one-time command shown by the dashboard. For example:

```powershell
npm run runtime -- --server https://your-atlas-host.example --token ONE_TIME_TOKEN
```

Remote control-plane URLs must use HTTPS. Loopback HTTP is accepted only for local development. The runtime makes outbound requests only, buffers telemetry across disconnections, verifies every command signature and expiry, and can be revoked from the dashboard.

## Active browser bridge

ATLAS includes a consent-based Chrome extension in `browser-extension/`:

1. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
2. Select the repository's `browser-extension` directory.
3. In the ATLAS **Browser** dashboard, create a pairing token for an environment.
4. Open the extension on the exact tab you approve, enter the ATLAS URL and one-time token, then connect.
5. A persistent **ON** badge shows access. Use the extension or dashboard to disconnect immediately.

The extension has no cookie permission, never shares unrelated tabs, refuses sensitive-field typing, redacts DOM values, masks sensitive inputs before screenshots, and accepts actions only through the tab's environment Manager.

## Honest bootstrap limits

- The remote runtime currently executes the built-in `ping` and `inspect` protocol commands. Broader remote tools must be added through explicit capability-scoped providers.
- Public internet hosting, user authentication, and TLS termination are M7/M9 concerns; M3 requires an existing HTTPS control-plane URL for internet-connected environments.
- The browser extension must be loaded into Chrome once by the user; browsers intentionally require this physical consent step. Chrome Web Store packaging and signing remain an M9 distribution task.
- Workflow observation is represented and persisted as a learning mode; recording desktop demonstrations requires a future OS-specific capture provider.
- Financial, messaging, and other business integrations are intentionally not hard-coded into the platform.
- The scheduler runs while the ATLAS process is running. Production always-on use requires running it as an OS service.

## Verification

```powershell
npm run check
npm run smoke
```
