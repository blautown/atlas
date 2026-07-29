let state = null;
let providerHealth = null;
let settingsState = null;
let activeChat = { kind: "ada", ownerId: "ada" };
let jobPoll = null;
let activeView = "overview";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const fmt = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not yet";
const badStatuses = ["failed", "faulted", "rejected"];
const warnStatuses = ["pending", "configured", "waiting", "waiting_approval", "needs_input"];
const badge = (status) => `<span class="badge ${badStatuses.includes(status) ? "bad" : warnStatuses.includes(status) ? "warn" : ""}">${esc(String(status).replaceAll("_", " "))}</span>`;
const empty = (title, detail = "") => `<div class="empty"><strong>${esc(title)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</div>`;
const list = (items) => `<div class="list">${items.join("")}</div>`;

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers ?? {}) } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed.");
  return payload;
}

function notice(message, error = false) {
  $("#notice").innerHTML = `<div class="notice ${error ? "error" : ""}">${esc(message)}</div>`;
  setTimeout(() => { $("#notice").innerHTML = ""; }, 5000);
}

async function refresh() {
  [state, providerHealth, settingsState] = await Promise.all([request("/api/state"), request("/api/providers/health"), request("/api/settings")]);
  render();
}

function latestJob(kind, ownerId, milestoneId) {
  const matches = state.jobs.filter((job) => job.kind === kind && (!ownerId || job.owner_id === ownerId) && (!milestoneId || job.milestone_id === milestoneId));
  return matches.find((job) => !["completed", "failed"].includes(job.status)) ?? matches[0];
}

function runActions(run) {
  const actions = [];
  if (run.status === "running") actions.push(["pause", "Pause"], ["cancel", "Cancel"]);
  if (run.status === "paused") actions.push(["resume", "Resume"], ["cancel", "Cancel"]);
  if (["failed", "cancelled"].includes(run.status)) actions.push(["retry", "Retry"]);
  return actions.length ? `<div class="actions">${actions.map(([action, label]) => `<button class="secondary" data-run-control="${esc(run.id)}" data-action="${action}">${label}</button>`).join("")}</div>` : "";
}

function render() {
  const c = state.capacity;
  $("#fleetState").textContent = c.environmentsTotal ? `${c.environmentsOnline} of ${c.environmentsTotal} environments online` : "Ready for first environment";
  const modelLabel = state.providers.modelId ? `${state.providers.model} · ${state.providers.modelId}` : state.providers.model;
  $("#providerStatus").innerHTML = `<p class="nav-label">PROVIDERS</p><strong>${esc(modelLabel)}</strong><small>${esc(providerHealth?.status ?? "unknown")} · ${esc(providerHealth?.detail ?? "Health unavailable")}</small><strong>${esc(state.providers.execution)}</strong><small>Execution</small>`;
  $("#metrics").innerHTML = [
    ["Operational capacity", `${c.score}%`, "Available supervised workload"],
    ["Environment fleet", `${c.environmentsOnline}/${c.environmentsTotal}`, "Online and connected"],
    ["Active work", c.activeRuns, "Tasks currently executing"],
    ["Needs attention", state.approvals.filter((a) => a.status === "pending").length, "Pending your decision"]
  ].map(([label, value, detail]) => `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`).join("");

  const connectorDevices = state.connector?.devices ?? [];
  const actorSystem = state.actorSystem ?? { actors: [], deployments: [], manifests: [], capabilitySnapshots: [], capacitySnapshots: [], messages: [] };
  const envItems = state.environments.map((env) => {
    const device = connectorDevices.find((item) => item.environment_id === env.id);
    const capabilities = actorSystem.capabilitySnapshots.find((item) => item.environment_id === env.id);
    const capacity = actorSystem.capacitySnapshots.find((item) => item.environment_id === env.id);
    return `<div class="item">
      <div class="item-head"><div><strong>${esc(env.name)}</strong><small>${esc(env.kind)} environment</small></div>${badge(env.status)}</div>
      <div class="manager-row"><div><span class="mini-avatar">${esc(initials(env.manager_name))}</span><span><strong>${esc(env.manager_name)}</strong><small>Dedicated AI Manager · ${esc(env.manager_status)}</small></span></div><button data-chat-kind="manager" data-owner="${esc(env.manager_id)}">Message</button></div>
      <details><summary>Capabilities</summary><div class="pre">${esc(JSON.stringify(capabilities?.capabilities ?? env.capabilities ?? {}, null, 2))}</div></details>
      <details><summary>Operational capacity</summary><div class="pre">${esc(JSON.stringify(capacity?.capacity ?? { available: false, reason: "Awaiting a fresh capacity observation" }, null, 2))}</div></details>
      ${device?.status === "active" ? `<div class="actions"><button class="danger" data-revoke-environment="${esc(env.id)}">Revoke remote access</button></div>` : ""}
    </div>`;
  });
  $("#environmentSummary").innerHTML = envItems.length ? list(envItems.slice(0, 3)) : empty("No environments connected", "Connect this computer to create your first managed workspace.");
  $("#environmentList").innerHTML = envItems.length ? list(envItems) : empty("No environments connected", "Use the form to connect this computer or a cloud runtime.");
  $("#environmentCount").textContent = state.environments.length;

  const pending = state.approvals.filter((a) => a.status === "pending");
  $("#attentionSummary").innerHTML = pending.length ? list(pending.map((a) => `<div class="item compact"><div class="item-head"><div><strong>${esc(a.title)}</strong><small>${fmt(a.requested_at)}</small></div>${badge(a.status)}</div></div>`)) : empty("Nothing needs you", "ATLAS will surface approvals and escalations here.");
  $("#approvalList").innerHTML = state.approvals.length ? list(state.approvals.map((a) => `<div class="item">
    <div class="item-head"><div><strong>${esc(a.title)}</strong><small>${esc(a.kind)} · ${fmt(a.requested_at)}</small></div>${badge(a.status)}</div>
    <div class="pre">${esc(a.detail_json)}</div>
    ${a.status === "pending" ? `<div class="actions"><button data-approval="${a.id}" data-decision="approved">Approve</button><button class="danger" data-approval="${a.id}" data-decision="rejected">Reject</button></div>` : ""}
  </div>`)) : empty("No approval requests", "Sensitive actions will pause here for your decision.");

  const runItems = state.runs.map((run) => `<div class="item compact"><div class="item-head"><div><strong>${esc(run.objective)}</strong><small>${fmt(run.started_at)} · ${esc(run.result ?? run.error ?? "In progress")}</small></div>${badge(run.status)}</div>${runActions(run)}</div>`);
  $("#runSummary").innerHTML = runItems.length ? list(runItems.slice(0, 5)) : empty("No execution yet", "Deploy a task when you are ready.");
  $("#runList").innerHTML = runItems.length ? list(runItems) : empty("No execution history", "Completed and active task runs will appear here.");
  $("#runCount").textContent = state.runs.length;

  const temporaryAgents = state.agents.filter((agent) => agent.lifecycle === "temporary");
  $("#agentList").innerHTML = temporaryAgents.length ? list(temporaryAgents.map((agent) => `<div class="item compact"><div class="item-head"><div><strong>${esc(agent.name)}</strong><small>temporary · ${esc(agent.objective)}</small></div>${badge(agent.status)}</div></div>`)) : empty("No temporary agents active", "Managers create bounded workers when execution requires them.");
  const actorItems = actorSystem.actors.map((actor) => {
    const deployment = actor.deployment;
    const manifest = deployment ? actorSystem.manifests.find((item) => item.deployment_id === deployment.id) : null;
    const tasks = actor.routine_tasks.map((task) => `<div class="item compact"><div class="item-head"><div><strong>${esc(task.title)}</strong><small>${esc(task.timing_text)} · ${esc(task.intention)}</small></div>${badge(task.status)}</div><small>${task.schedule ? `Schedule v${esc(task.schedule.version)} · ${esc(task.schedule.status)}` : "Manager schedule compilation required"}</small></div>`).join("");
    const scheduleForms = actor.routine_tasks.filter((task) => !task.schedule || task.schedule.status !== "approved").map((task) => `<form data-schedule-task="${esc(task.id)}"><strong>Approve schedule · ${esc(task.title)}</strong><small>Original intention: ${esc(task.timing_text)}</small><label>Timezone<input name="timezone" required value="${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}"></label><label>Interval seconds<input name="seconds" type="number" min="60" required value="1800"></label><label>Missed run<select name="missedRunPolicy"><option value="run_next">Run at next opportunity</option><option value="skip">Skip missed run</option></select></label><button type="submit">Compile and approve</button></form>`).join("");
    const skillForms = `<form data-actor-skill="${esc(actor.id)}"><strong>Teach an Actor Skill</strong><label>Name<input name="name" required placeholder="Claim nuts.gg"></label><label>Purpose<input name="purpose" required placeholder="Complete and verify the giveaway claim"></label><label>Routine Task<select name="routineTaskId">${actor.routine_tasks.map((task) => `<option value="${esc(task.id)}">${esc(task.title)}</option>`).join("")}</select></label><label>Verification metric<input name="verificationMetric" required placeholder="claim_confirmed"></label><label><input type="checkbox" name="browser"> Browser capability</label><label><input type="checkbox" name="internet"> Internet capability</label><label>Required configuration<input name="configuration" placeholder="persistent_browser_profile"></label><label>Manager environmental skill<input name="environmentalSkill" placeholder="Maintain browser profile"></label><button type="submit">Create Skill draft</button></form>`;
    const skillActions = actor.skills.filter((skill) => skill.status !== "proven").map((skill) => `<button data-skill-rehearse="${esc(skill.id)}">Record successful rehearsal for ${esc(skill.name)}</button>`).join("");
    const managerPreparation = deployment ? `<details><summary>Manager environment preparation</summary>
      <form data-environmental-skill="${esc(deployment.environment_id)}"><strong>Prove an environmental skill here</strong><label>Name<input name="name" required placeholder="Maintain browser profile"></label><label>Health gate<input name="healthGate" required placeholder="Authenticated session remains healthy"></label><button type="submit">Record proof</button></form>
      <form data-deployment-config="${esc(deployment.id)}"><strong>Provision deployment configuration</strong><label>Kind<input name="kind" required placeholder="persistent_browser_profile"></label><label>Label<input name="label" required placeholder="${esc(actor.name)} browser profile"></label><label>Secret reference<select name="secretRefId"><option value="">No credential reference</option>${(settingsState?.secrets ?? []).filter((secret) => secret.status === "active").map((secret) => `<option value="${esc(secret.id)}">${esc(secret.label)}</option>`).join("")}</select></label><label><input type="checkbox" name="ready"> Configuration is provisioned and health-checked</label><button type="submit">Save scoped configuration</button></form>
      <form data-health-gate="${esc(deployment.id)}"><strong>Define a live Routine health gate</strong><label>Routine Task<select name="routineTaskId">${actor.routine_tasks.map((task) => `<option value="${esc(task.id)}">${esc(task.title)}</option>`).join("")}</select></label><label>Metric / gate description<input name="metric" required placeholder="Claim confirmation received within 5 minutes"></label><label><input type="checkbox" name="healthy"> Current evidence passes this gate</label><button type="submit">Save and evaluate health gate</button></form></details>` : "";
    const options = state.environments.map((env) => `<option value="${esc(env.id)}">${esc(env.name)}</option>`).join("");
    return `<div class="item"><div class="item-head"><div><strong>${esc(actor.name)}</strong><small>${esc(actor.identity)} · ${esc(actor.relationship)}</small></div>${badge(actor.status)}</div><p>${esc(actor.personality)}</p>
      <details open><summary>Routine Tasks (${actor.routine_tasks.length})</summary>${tasks || empty("No Routine Tasks")}</details>
      <details><summary>Goals and intended outcomes</summary><div class="pre">${esc(JSON.stringify({ goals: actor.goals, outcomes: actor.outcomes }, null, 2))}</div></details>
      <details><summary>Actor Skills (${actor.skills.length})</summary><div class="pre">${esc(JSON.stringify(actor.skills, null, 2))}</div></details>
      <details><summary>Prepare schedules and Skills</summary>${scheduleForms}${skillForms}<div class="actions">${skillActions}</div></details>
      ${managerPreparation}
      ${manifest ? `<details open><summary>Live deployment manifest</summary><div class="pre">${esc(JSON.stringify({ status: manifest.status, summary: manifest.summary, requirements: manifest.requirements }, null, 2))}</div></details>` : ""}
      <div class="actions"><button data-chat-kind="actor" data-owner="${esc(actor.id)}">Message Actor</button>
      ${deployment ? `<button data-actor-deploy="${esc(deployment.id)}">Activate ready tasks</button><button class="secondary" data-actor-refresh="${esc(deployment.id)}">Refresh readiness</button>${deployment.status !== "suspended" ? `<button class="danger" data-actor-suspend="${esc(deployment.id)}">Suspend</button>` : ""}` : `<label>Assess environment<select data-actor-environment="${esc(actor.id)}">${options}</select></label><button data-actor-assess="${esc(actor.id)}">Assess readiness</button>`}</div></div>`;
  });
  $("#actorList").innerHTML = actorItems.length ? list(actorItems) : empty("No Actors yet", "Create a profile and first Routine Task without assigning an environment.");
  $("#actorCount").textContent = actorSystem.actors.length;
  $("#workflowList").innerHTML = state.workflows.length ? list(state.workflows.map((workflow) => `<div class="item"><div class="item-head"><div><strong>${esc(workflow.name)}</strong><small>${esc(workflow.learning_mode)} · ${esc(workflow.trigger_type)} ${esc(workflow.trigger_value ?? "")}</small></div>${badge(workflow.enabled ? "enabled" : "disabled")}</div><p>${esc(workflow.instruction)}</p><div class="actions"><button class="secondary" data-workflow-control="${esc(workflow.id)}" data-enabled="${workflow.enabled ? "false" : "true"}">${workflow.enabled ? "Disable" : "Enable"}</button></div></div>`)) : empty("No learned workflows", "Teach a Manager with instructions, observation, or both.");
  $("#agentCount").textContent = temporaryAgents.length;
  $("#workflowCount").textContent = state.workflows.length;

  $("#auditList").innerHTML = state.audit.length ? list(state.audit.map((event) => `<div class="item compact"><div class="item-head"><div><strong>${esc(event.action)}</strong><small>${esc(event.actor_type)} → ${esc(event.entity_type)} · ${fmt(event.created_at)}</small></div></div></div>`)) : empty("No activity recorded", "Actions taken through ATLAS will be recorded here.");
  $("#approvalCount").textContent = pending.length;
  $("#auditCount").textContent = state.audit.length;

  const browserState = state.browser ?? { sessions: [], commands: [], events: [] };
  const browserSessions = browserState.sessions ?? [];
  $("#browserCount").textContent = browserSessions.filter((session) => session.status === "connected").length;
  $("#browserSessionList").innerHTML = browserSessions.length ? list(browserSessions.map((session) => `<div class="item"><div class="item-head"><div><strong>${esc(session.title)}</strong><small>${esc(session.url)} · consented ${fmt(session.consented_at)}</small></div>${badge(session.status)}</div>${session.status === "connected" ? `<div class="actions"><button class="danger" data-browser-revoke="${esc(session.id)}">Disconnect and revoke</button></div>` : ""}</div>`)) : empty("No browser tabs connected", "Create a pairing token, then approve the active tab in the ATLAS extension.");
  $("#browserEnvironment").innerHTML = state.environments.map((env) => `<option value="${esc(env.id)}">${esc(env.name)}</option>`).join("");
  $("#browserSession").innerHTML = browserSessions.filter((session) => session.status === "connected").map((session) => `<option value="${esc(session.id)}">${esc(session.title)}</option>`).join("");
  $("#browserEventList").innerHTML = browserState.events?.length ? list(browserState.events.slice(0, 20).map((event) => `<div class="item compact"><strong>${esc(event.type)}</strong><small>${fmt(event.received_at)}</small><details><summary>Observation</summary><div class="pre">${esc(event.payload_json)}</div></details></div>`)) : empty("No browser observations yet", "Send an inspect or screenshot action through the tab's Manager.");
  const learning = state.learning ?? { observations: [], drafts: [], rehearsals: [], actions: [] };
  const connectedBrowserSessions = browserSessions.filter((session) => session.status === "connected");
  $("#observationSession").innerHTML = connectedBrowserSessions.map((session) => `<option value="${esc(session.id)}">${esc(session.title)}</option>`).join("");
  const activeObservation = learning.observations.find((item) => ["recording", "analyzing"].includes(item.status));
  $("#activeObservation").innerHTML = activeObservation ? `<div class="item"><div class="item-head"><div><strong>${esc(activeObservation.name)}</strong><small>${activeObservation.status === "recording" ? "Recording this approved tab" : "Collecting final actions"}</small></div>${badge(activeObservation.status)}</div>${activeObservation.status === "recording" ? `<button data-observation-stop="${esc(activeObservation.id)}">Stop and create draft</button>` : ""}</div>` : empty("No recording active", "Start a recording, complete the task in the approved tab, then return here to stop it.");
  $("#draftCount").textContent = learning.drafts.length;
  $("#workflowDraftList").innerHTML = learning.drafts.length ? list(learning.drafts.map((draft) => {
    const rehearsal = learning.rehearsals.find((item) => item.draft_id === draft.id);
    return `<div class="item"><div class="item-head"><div><strong>${esc(draft.name)}</strong><small>Editable Manager workflow and requirements report</small></div>${badge(draft.status)}</div><details open><summary>Workflow graph</summary><div class="pre">${esc(JSON.stringify(JSON.parse(draft.graph_json), null, 2))}</div></details><details><summary>Required assets and permissions</summary><div class="pre">${esc(JSON.stringify(JSON.parse(draft.requirements_json), null, 2))}</div></details>${rehearsal ? `<details><summary>Latest rehearsal deviations</summary><div class="pre">${esc(JSON.stringify(JSON.parse(rehearsal.deviations_json), null, 2))}</div></details>` : ""}<form data-draft-edit="${esc(draft.id)}"><label>Correction for the Manager<input name="correction" placeholder="Change, decision, wait, or recovery rule"></label><button class="secondary" type="submit">Save correction</button></form><div class="actions">${["draft", "rehearsed"].includes(draft.status) ? `<button data-draft-rehearse="${esc(draft.id)}">Run safe rehearsal</button>` : ""}${draft.status === "rehearsed" && rehearsal?.status === "completed" ? `<button data-draft-approval="${esc(draft.id)}">Request autonomy approval</button>` : ""}</div></div>`;
  })) : empty("No workflow drafts", "A completed observation becomes an editable workflow and requirements report here.");

  const roadmap = state.roadmap ?? { milestones: [] };
  $("#roadmapPurpose").textContent = roadmap.purpose ?? "Roadmap unavailable.";
  $("#roadmapList").innerHTML = roadmap.milestones?.length ? `<div class="roadmap">${roadmap.milestones.map((milestone, index) => `<div class="roadmap-item">
    <div class="roadmap-index">${String(index + 1).padStart(2, "0")}</div>
    <div class="roadmap-body"><div class="item-head"><div><strong>${esc(milestone.title)}</strong><small>${esc(milestone.id)} · ${esc(milestone.deliverables.length)} deliverables</small></div>${badge(milestone.status)}</div><p>${esc(milestone.objective)}</p>${renderMilestoneProgress(milestone)}<div class="actions"><button class="secondary" data-roadmap="${esc(milestone.id)}" data-roadmap-action="discuss">Discuss</button><button data-roadmap="${esc(milestone.id)}" data-roadmap-action="implement">Start milestone</button></div></div>
  </div>`).join("")}</div>` : empty("Roadmap unavailable", "ATLAS could not load the repository roadmap.");

  for (const select of [$("#runEnvironment"), $("#agentEnvironment")]) {
    const current = select.value;
    select.innerHTML = state.environments.map((env) => `<option value="${env.id}">${esc(env.name)} · ${esc(env.status)}</option>`).join("");
    if (current) select.value = current;
  }


  const activeSecrets = settingsState.secrets.filter((secret) => secret.status === "active");
  document.querySelectorAll(".model-role-form").forEach((form) => {
    const setting = settingsState.modelRoles.find((item) => item.role === form.dataset.role);
    if (!setting) return;
    form.elements.provider.value = setting.provider; form.elements.model.value = setting.model; form.elements.baseUrl.value = setting.base_url ?? ""; form.elements.timeoutMs.value = setting.timeout_ms;
    form.elements.secretRefId.innerHTML = '<option value="">Not required for Ollama</option>' + activeSecrets.map((secret) => `<option value="${esc(secret.id)}">${esc(secret.provider)} · ${esc(secret.label)}</option>`).join("");
    form.elements.secretRefId.value = setting.secret_ref_id ?? "";
  });
  $("#secretList").innerHTML = settingsState.secrets.length ? list(settingsState.secrets.map((secret) => `<div class="item compact"><div class="item-head"><div><strong>${esc(secret.label)}</strong><small>${esc(secret.provider)} · plaintext never displayed</small></div>${badge(secret.status)}</div>${secret.status === "active" ? `<div class="actions"><button class="secondary" data-secret-rotate="${esc(secret.id)}">Rotate</button><button class="danger" data-secret-revoke="${esc(secret.id)}">Revoke</button></div>` : ""}</div>`)) : empty("No secret references", "Local Ollama does not require one.");
  $("#permissionEnvironment").innerHTML = state.environments.map((env) => `<option value="${esc(env.id)}">${esc(env.name)}</option>`).join("");
  $("#backupList").innerHTML = settingsState.backups.length ? list(settingsState.backups.map((backup) => `<div class="item compact"><strong>${esc(backup.filename)}</strong><small>${esc(backup.status)} · ${Math.round(backup.size_bytes / 1024)} KiB</small></div>`)) : empty("No backups yet");
  $("#unavailableControls").innerHTML = `<div class="item compact"><strong>Restart</strong><small>${esc(settingsState.restart.explanation)}</small></div><div class="item compact"><strong>Recovery</strong><small>${esc(settingsState.recovery.explanation)}</small></div>`;

  renderChatDock();
  renderMessenger();
  bindDynamic();
}

function initials(value) {
  return String(value ?? "AI").split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function renderChatDock() {
  const adaJob = latestJob("ada");
  const buttons = [
    `<button class="chat-launcher primary ${activeChat.kind === "ada" ? "selected" : ""}" data-chat-kind="ada" data-owner="ada" aria-label="Open ADA" title="Your ATLAS Digital Assistant"><span>ADA</span>${jobSignal(adaJob)}</button>`
  ];
  for (const manager of state.managers) {
    const job = latestJob("manager", manager.id);
    buttons.push(`<button class="chat-launcher ${activeChat.kind === "manager" && activeChat.ownerId === manager.id ? "selected" : ""}" data-chat-kind="manager" data-owner="${esc(manager.id)}" aria-label="Open ${esc(manager.name)}" title="${esc(manager.name)}"><span>${esc(initials(manager.name))}</span>${jobSignal(job, manager.status)}</button>`);
  }
  for (const actor of state.actorSystem?.actors ?? []) {
    buttons.push(`<button class="chat-launcher ${activeChat.kind === "actor" && activeChat.ownerId === actor.id ? "selected" : ""}" data-chat-kind="actor" data-owner="${esc(actor.id)}" aria-label="Open ${esc(actor.name)}" title="${esc(actor.name)}"><span>${esc(initials(actor.name))}</span>${jobSignal(null, actor.status)}</button>`);
  }
  $("#chatDock").innerHTML = `<small class="dock-label">CHAT</small>${buttons.join("")}`;
}

function jobSignal(job, fallback = "ready") {
  const status = job?.frozen ? "frozen" : job?.status ?? fallback;
  const signal = badStatuses.includes(status) || status === "frozen" ? "bad" : warnStatuses.includes(status) || ["running", "queued"].includes(status) ? "busy" : "";
  return `<i class="launcher-signal ${signal}" aria-hidden="true"></i>`;
}

function chatDetails() {
  if (activeChat.kind === "ada") return { title: "ADA", subtitle: "Your guide across ATLAS", avatar: "ADA", placeholder: "What would you like to understand or accomplish?", hint: "ADA can explain live state and prepare governed handoffs." };
  if (activeChat.kind === "actor") {
    const actor = state.actorSystem?.actors.find((item) => item.id === activeChat.ownerId);
    return { title: actor?.name ?? "Actor", subtitle: `${actor?.status ?? "unknown"} · ${actor?.relationship ?? "ATLAS Actor"}`, avatar: initials(actor?.name), placeholder: "Talk directly with this Actor…", hint: actor?.deployment ? "You may initiate conversation; proactive operational messages route through the Environment Manager." : "This Actor is not currently supervised by an Environment Manager." };
  }
  const manager = state.managers.find((item) => item.id === activeChat.ownerId);
  const env = state.environments.find((item) => item.manager_id === activeChat.ownerId);
  return { title: manager?.name ?? "AI Manager", subtitle: `${env?.name ?? "Environment"} · ${manager?.status ?? "unknown"}`, avatar: initials(manager?.name), placeholder: "Describe a workflow, task, or expected outcome…", hint: "This Manager supervises all agents in its environment." };
}

function renderMessenger() {
  if (!state) return;
  const details = chatDetails();
  $("#messengerAvatar").textContent = details.avatar;
  $("#messengerTitle").textContent = details.title;
  $("#messengerSubtitle").textContent = details.subtitle;
  $("#messengerForm textarea").placeholder = details.placeholder;
  $("#composerHint").textContent = details.hint;
  const messages = activeChat.kind === "actor"
    ? (state.actorSystem?.messages ?? []).filter((message) => message.actor_id === activeChat.ownerId)
    : state.messages.filter((message) => message.conversation_kind === activeChat.kind && (activeChat.kind !== "manager" || message.owner_id === activeChat.ownerId));
  const emptyTitle = activeChat.kind === "ada" ? "Meet your ADA" : activeChat.kind === "actor" ? "Start an Actor conversation" : "Start a Manager conversation";
  const emptyDetail = activeChat.kind === "ada" ? "Ask about ATLAS, your environments, or what to do next." : activeChat.kind === "actor" ? "You can always initiate a direct conversation with this Actor." : "Define work in plain English; the Manager will plan and supervise it.";
  $("#messengerMessages").innerHTML = messages.length ? messages.map(renderMessage).join("") : empty(emptyTitle, emptyDetail);
  const job = activeChat.kind === "actor" ? null : latestJob(activeChat.kind, activeChat.kind === "manager" ? activeChat.ownerId : null);
  $("#messengerContext").innerHTML = renderJob(job);
  requestAnimationFrame(() => { const el = $("#messengerMessages"); el.scrollTop = el.scrollHeight; });
}

function openChat(kind, ownerId) {
  activeChat = { kind, ownerId };
  $("#messenger").classList.remove("hidden");
  renderChatDock();
  renderMessenger();
  bindChatLaunchers();
  setTimeout(() => $("#messengerForm textarea").focus(), 50);
}

function bindChatLaunchers() {
  document.querySelectorAll("[data-chat-kind]").forEach((button) => button.onclick = () => openChat(button.dataset.chatKind, button.dataset.owner));
}

function renderMilestoneProgress(milestone) {
  if (milestone.status === "completed") {
    const evidence = milestone.completionEvidence ?? [];
    return `<div class="work-status"><div class="item-head"><span>Milestone verified</span>${badge("completed")}</div><div class="progress"><span style="width:100%"></span></div>${evidence.length ? `<details><summary>Completion evidence (${evidence.length})</summary><ul>${evidence.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></details>` : ""}</div>`;
  }
  const job = latestJob("ada", null, milestone.id);
  if (!job) return "";
  const stateLabel = job.frozen ? "No heartbeat — may need attention" : job.stage;
  return `<div class="work-status ${job.frozen ? "frozen" : ""}"><div class="item-head"><span>${esc(stateLabel)}</span>${badge(job.status)}</div><div class="progress"><span style="width:${Number(job.progress)}%"></span></div><small>${Number(job.progress)}% · updated ${fmt(job.updated_at)}</small></div>`;
}

function renderMessage(message) {
  const actor = activeChat.kind === "actor" ? state.actorSystem?.actors.find((item) => item.id === activeChat.ownerId) : null;
  const speaker = message.role === "user" ? "You" : activeChat.kind === "ada" ? "ADA" : activeChat.kind === "actor" ? actor?.name ?? "Actor" : "AI Manager";
  return `<div class="message ${esc(message.role)}"><div class="message-meta"><strong>${speaker}</strong><small>${fmt(message.created_at)}</small></div><p>${esc(message.content)}</p></div>`;
}

function renderJob(job) {
  if (!job) return `<div class="conversation-state"><span class="status-dot"></span><div><strong>Ready</strong><small>Waiting for your message</small></div></div>`;
  const result = job.result ?? {};
  const label = job.frozen ? "No heartbeat — work may have stopped" : job.stage;
  return `<div class="work-status conversation ${job.frozen ? "frozen" : ""}">
    <div class="item-head"><div><strong>${esc(label)}</strong><small>${Number(job.progress)}% · heartbeat ${fmt(job.heartbeat_at)}</small></div>${badge(job.status)}</div>
    <div class="progress"><span style="width:${Number(job.progress)}%"></span></div>
    ${result.reasoningSummary ? `<details><summary>Reasoning summary</summary><p>${esc(result.reasoningSummary)}</p></details>` : ""}
    ${result.updates?.length ? `<details><summary>Work updates (${result.updates.length})</summary><ul>${result.updates.map((update) => `<li>${esc(update)}</li>`).join("")}</ul></details>` : ""}
    ${result.handoff ? `<div class="handoff"><small>Recommended handoff</small><strong>${esc(result.handoff.title)}</strong><button data-handoff-job="${esc(job.id)}">Prepare handoff</button></div>` : ""}
    ${job.error ? `<p class="error-text">${esc(job.error)}</p>` : ""}
  </div>`;
}

function bindDynamic() {
  bindChatLaunchers();
  document.querySelectorAll("[data-handoff-job]").forEach((button) => button.onclick = async () => {
    const job = state.jobs.find((item) => item.id === button.dataset.handoffJob);
    const handoff = job?.result?.handoff;
    if (!handoff) return notice("The handoff is no longer available.", true);
    if (handoff.type === "development") {
      await sendCodingAgent(handoff.prompt);
      return;
    }
    openChat("manager", handoff.ownerId);
    $("#messengerForm textarea").value = handoff.prompt;
    $("#messengerForm textarea").focus();
    notice("Manager handoff prepared for your review. Send it when ready.");
  });
  document.querySelectorAll("[data-roadmap]").forEach((button) => button.onclick = async () => {
    const milestone = state.roadmap.milestones.find((item) => item.id === button.dataset.roadmap);
    if (!milestone) return notice("Roadmap milestone not found.", true);
    const prompt = button.dataset.roadmapAction === "implement"
      ? `Begin roadmap milestone ${milestone.id}: ${milestone.title}. Inspect the repository before changing it. Implement the smallest complete vertical slice that advances its objective and acceptance criteria. Preserve system integrity, request scoped approvals for writes and commands, run the full verification suite, and report evidence, risks, and remaining work. Do not mark the milestone complete unless every acceptance criterion is demonstrated.`
      : `Review roadmap milestone ${milestone.id}: ${milestone.title}. Explain its purpose, dependencies, deliverables, acceptance criteria, current repository readiness, and the safest next implementation slice. Do not make changes in this discussion.`;
    openChat("ada", "ada");
    if (button.dataset.roadmapAction === "implement") await sendCodingAgent(prompt);
    else await sendChat(prompt);
  });
  document.querySelectorAll("[data-draft-edit]").forEach((form) => form.onsubmit = async (event) => { event.preventDefault(); try { await request(`/api/workflow-drafts/${form.dataset.draftEdit}`, { method: "PATCH", body: JSON.stringify(formObject(form)) }); notice("Manager correction saved."); await refresh(); } catch (error) { notice(error.message, true); } });
  document.querySelectorAll("[data-draft-rehearse]").forEach((button) => button.onclick = async () => { try { await request(`/api/workflow-drafts/${button.dataset.draftRehearse}/rehearse`, { method: "POST", body: "{}" }); notice("Safe rehearsal queued in the approved tab."); await refresh(); } catch (error) { notice(error.message, true); } });
  document.querySelectorAll("[data-draft-approval]").forEach((button) => button.onclick = async () => { try { await request(`/api/workflow-drafts/${button.dataset.draftApproval}/approval`, { method: "POST", body: "{}" }); notice("Autonomy approval added to Governance."); await refresh(); } catch (error) { notice(error.message, true); } });  document.querySelectorAll("[data-browser-revoke]").forEach((button) => button.onclick = async () => { if(!window.confirm("Disconnect and permanently revoke this browser session?"))return;try{await request(`/api/browser/sessions/${button.dataset.browserRevoke}/revoke`,{method:"POST",body:"{}"});notice("Browser session revoked.");await refresh();}catch(error){notice(error.message,true);} });
  document.querySelectorAll("[data-revoke-environment]").forEach((button) => button.onclick = async () => { if(!window.confirm("Revoke this environment? Its runtime will immediately lose command access."))return; try{await request(`/api/connectors/environments/${button.dataset.revokeEnvironment}/revoke`,{method:"POST",body:"{}"});notice("Environment access revoked.");await refresh();}catch(error){notice(error.message,true);} });
  document.querySelectorAll("[data-secret-rotate]").forEach((button) => button.onclick = async () => { const value=window.prompt("Paste the replacement secret. It will be encrypted immediately."); if(!value)return; try{await request(`/api/settings/secrets/${button.dataset.secretRotate}/rotate`,{method:"POST",body:JSON.stringify({value})});notice("Secret reference rotated.");await refresh();}catch(error){notice(error.message,true);} });
  document.querySelectorAll("[data-secret-revoke]").forEach((button) => button.onclick = async () => { try{await request(`/api/settings/secrets/${button.dataset.secretRevoke}/revoke`,{method:"POST",body:"{}"});notice("Secret reference revoked.");await refresh();}catch(error){notice(error.message,true);} });
  document.querySelectorAll("[data-run-control]").forEach((button) => button.onclick = async () => {
    try {
      await request(`/api/runs/${button.dataset.runControl}/control`, { method: "POST", body: JSON.stringify({ action: button.dataset.action }) });
      notice(`Task ${button.dataset.action} requested.`);
      await refresh();
    } catch (error) { notice(error.message, true); }
  });
  document.querySelectorAll("[data-workflow-control]").forEach((button) => button.onclick = async () => {
    try {
      const enabled = button.dataset.enabled === "true";
      await request(`/api/workflows/${button.dataset.workflowControl}/control`, { method: "POST", body: JSON.stringify({ enabled }) });
      notice(`Workflow ${enabled ? "enabled" : "disabled"}.`);
      await refresh();
    } catch (error) { notice(error.message, true); }
  });
  document.querySelectorAll("[data-schedule-task]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();const data=formObject(form);
    try{await request(`/api/routine-tasks/${form.dataset.scheduleTask}/schedule`,{method:"POST",body:JSON.stringify({timezone:data.timezone,schedule:{type:"interval",seconds:Number(data.seconds)},overlapPolicy:"skip",missedRunPolicy:data.missedRunPolicy,retryLimit:1,latenessThresholdSeconds:300,approved:true})});notice("Exact schedule compiled and approved with the original timing preserved.");await refresh();}catch(error){notice(error.message,true);}
  });
  document.querySelectorAll("[data-actor-skill]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();const data=formObject(form),dependencies=[];
    if(form.elements.browser.checked)dependencies.push({kind:"capability",key:"browser",label:"Browser"});
    if(form.elements.internet.checked)dependencies.push({kind:"capability",key:"internet",label:"Internet"});
    if(data.configuration)dependencies.push({kind:"configuration",key:data.configuration,label:data.configuration});
    if(data.environmentalSkill)dependencies.push({kind:"environmental_skill",key:data.environmentalSkill,label:data.environmentalSkill});
    try{await request(`/api/actors/${form.dataset.actorSkill}/skills`,{method:"POST",body:JSON.stringify({name:data.name,purpose:data.purpose,routineTaskIds:[data.routineTaskId],steps:[{instruction:data.purpose}],verification:{metric:data.verificationMetric,expected:true},recovery:{escalateTo:"manager"},dependencies})});notice("Actor Skill draft created. It must pass a safe rehearsal before readiness.");await refresh();}catch(error){notice(error.message,true);}
  });
  document.querySelectorAll("[data-skill-rehearse]").forEach((button) => button.onclick = async () => {
    if(!window.confirm("Record this Skill rehearsal as successful and approved? Only continue when verified evidence exists."))return;
    try{await request(`/api/actor-skills/${button.dataset.skillRehearse}/rehearse`,{method:"POST",body:JSON.stringify({successful:true,approved:true,evidence:["User-confirmed dashboard rehearsal"]})});notice("Actor Skill marked proven with rehearsal evidence.");await refresh();}catch(error){notice(error.message,true);}
  });
  document.querySelectorAll("[data-environmental-skill]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();const data=formObject(form);
    try{await request(`/api/environments/${form.dataset.environmentalSkill}/environmental-skills`,{method:"POST",body:JSON.stringify({name:data.name,description:data.name,successful:true,evidence:{rehearsal:"User-confirmed proof"},healthGate:{description:data.healthGate}})});notice("Environmental Skill proven for this Manager and environment only.");await refresh();}catch(error){notice(error.message,true);}
  });
  document.querySelectorAll("[data-deployment-config]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();const data=formObject(form);
    try{await request(`/api/actor-deployments/${form.dataset.deploymentConfig}/configurations`,{method:"POST",body:JSON.stringify({kind:data.kind,label:data.label,secretRefId:data.secretRefId||undefined,ready:form.elements.ready.checked,health:{healthy:form.elements.ready.checked}})});notice("Manager configuration saved with a scoped credential reference.");await refresh();}catch(error){notice(error.message,true);}
  });
  document.querySelectorAll("[data-health-gate]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();const data=formObject(form);
    try{await request(`/api/actor-deployments/${form.dataset.healthGate}/health-gates`,{method:"POST",body:JSON.stringify({routineTaskId:data.routineTaskId,kind:"routine_verification",policy:{metric:data.metric},healthy:form.elements.healthy.checked,detail:{observedFrom:"dashboard"}})});notice("Routine health gate evaluated and saved.");await refresh();}catch(error){notice(error.message,true);}
  });
  document.querySelectorAll("[data-actor-assess]").forEach((button) => button.onclick = async () => {
    const select=document.querySelector(`[data-actor-environment="${button.dataset.actorAssess}"]`);
    if(!select?.value)return notice("Connect an environment before assessment.",true);
    try{await request(`/api/actors/${button.dataset.actorAssess}/assess/${select.value}`,{method:"POST",body:"{}"});notice("Manager created a live deployment readiness manifest.");await refresh();}catch(error){notice(error.message,true);}
  });
  document.querySelectorAll("[data-actor-deploy]").forEach((button) => button.onclick = async () => {
    try{await request(`/api/actor-deployments/${button.dataset.actorDeploy}/deploy`,{method:"POST",body:"{}"});notice("Ready Routine Tasks activated under the Environment Manager.");await refresh();}catch(error){notice(error.message,true);}
  });
  document.querySelectorAll("[data-actor-refresh]").forEach((button) => button.onclick = async () => {
    try{await request(`/api/actor-deployments/${button.dataset.actorRefresh}/refresh`,{method:"POST",body:"{}"});notice("Readiness and health gates refreshed.");await refresh();}catch(error){notice(error.message,true);}
  });
  document.querySelectorAll("[data-actor-suspend]").forEach((button) => button.onclick = async () => {
    try{await request(`/api/actor-deployments/${button.dataset.actorSuspend}/suspend`,{method:"POST",body:JSON.stringify({reason:"Suspended from dashboard"})});notice("Actor supervision suspended.");await refresh();}catch(error){notice(error.message,true);}
  });
}

function watchJob(jobId) {
  clearInterval(jobPoll);
  jobPoll = setInterval(async () => {
    try {
      await refresh();
      const job = state.jobs.find((item) => item.id === jobId);
      if (!job || ["completed", "failed", "waiting_approval", "needs_input"].includes(job.status)) clearInterval(jobPoll);
    } catch (error) {
      clearInterval(jobPoll);
      notice(`Live updates stopped: ${error.message}. Use Refresh to reconnect.`, true);
    }
  }, 1000);
}

const viewMeta = {
  overview: ["Overview", "System capacity, activity, and anything that needs you."],
  environments: ["Environments", "Connect execution targets and work with their dedicated Managers."],
  workforce: ["Actors & Work", "Create persistent identities, assess deployment readiness, and follow supervised execution."],
  browser: ["Browser", "Connect and supervise explicitly approved active tabs."],
  development: ["Roadmap", "Guide the safe evolution of ATLAS from inside ATLAS."],
  audit: ["Governance", "Approve sensitive actions and inspect the activity trail."],
  settings: ["Settings", "Configure providers, permissions, diagnostics, and backups."]
};

function showView(id) {
  activeView = id;
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".nav").forEach((button) => button.classList.toggle("active", button.dataset.view === id));
  $("#viewTitle").textContent = viewMeta[id]?.[0] ?? "ATLAS";
  $("#viewDescription").textContent = viewMeta[id]?.[1] ?? "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function formObject(form) { return Object.fromEntries(new FormData(form).entries()); }

async function submit(form, url, success) {
  try {
    await request(url, { method: "POST", body: JSON.stringify(formObject(form)) });
    form.reset();
    notice(success);
    await refresh();
  } catch (error) { notice(error.message, true); }
}

async function sendCodingAgent(message) {
  try {
    openChat("ada", "ada");
    const job = await request("/api/ada/coding-agent", { method: "POST", body: JSON.stringify({ message }) });
    await refresh();
    openChat("ada", "ada");
    watchJob(job.id);
    notice("ADA delegated the request to its coding agent.");
  } catch (error) { notice(error.message, true); }
}

async function sendChat(message) {
  try {
    if(activeChat.kind==="actor"){
      await request(`/api/actors/${activeChat.ownerId}/chat`,{method:"POST",body:JSON.stringify({message})});
      await refresh();openChat("actor",activeChat.ownerId);return;
    }
    const endpoint = activeChat.kind === "ada" ? "/api/ada/chat" : `/api/managers/${activeChat.ownerId}/chat`;
    const job = await request(endpoint, { method: "POST", body: JSON.stringify({ message }) });
    await refresh();
    openChat(activeChat.kind, activeChat.ownerId);
    watchJob(job.id);
  } catch (error) { notice(error.message, true); }
}

document.querySelectorAll(".nav").forEach((button) => button.onclick = () => showView(button.dataset.view));
document.querySelectorAll("[data-go]").forEach((button) => button.onclick = () => showView(button.dataset.go));
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-observation-stop]");
  if (!button) return;
  button.disabled = true;
  try {
    await request(`/api/observations/${button.dataset.observationStop}/stop`, { method: "POST", body: "{}" });
    notice("Collecting the final recorded actions.");
    await refresh();
  } catch (error) {
    button.disabled = false;
    notice(error.message, true);
  }
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-approval]");
  if (!button) return;
  button.disabled = true;
  try {
    await request(`/api/approvals/${button.dataset.approval}`, {
      method: "POST",
      body: JSON.stringify({ decision: button.dataset.decision })
    });
    notice(`Request ${button.dataset.decision}.`);
    await refresh();
  } catch (error) {
    button.disabled = false;
    notice(error.message, true);
  }
});
$("#refresh").onclick = () => refresh().then(() => notice("ATLAS state refreshed.")).catch((error) => notice(error.message, true));
$("#openAdaChat").onclick = () => openChat("ada", "ada");
$("#openDevChat").onclick = () => openChat("ada", "ada");
$("#minimiseMessenger").onclick = () => $("#messenger").classList.add("hidden");
$("#closeMessenger").onclick = () => $("#messenger").classList.add("hidden");
$("#environmentForm").onsubmit = (event) => { event.preventDefault(); submit(event.currentTarget, "/api/environments", "Environment connected and Manager assigned."); };
$("#remoteEnrollmentForm").onsubmit = async (event) => { event.preventDefault(); const form=event.currentTarget; try{const result=await request("/api/connectors/enrollment",{method:"POST",body:JSON.stringify(formObject(form))});const origin=location.origin;$("#enrollmentResult").innerHTML=`<div class="item"><strong>Enrollment ready for 15 minutes</strong><small>On the remote machine, clone/install ATLAS and run:</small><div class="pre">npm run runtime -- --server ${esc(origin)} --token ${esc(result.token)}</div><small>The token works once. Remote internet connections require an HTTPS ATLAS URL.</small></div>`;notice("Dedicated Manager created; waiting for the remote runtime.");await refresh();}catch(error){notice(error.message,true);} };
$("#browserPairingForm").onsubmit = async (event) => { event.preventDefault();try{const result=await request("/api/browser/pairings",{method:"POST",body:JSON.stringify(formObject(event.currentTarget))});$("#browserPairingResult").innerHTML=`<div class="item"><strong>Pairing token</strong><div class="pre">${esc(result.token)}</div><small>Expires ${fmt(result.expiresAt)}. Open the ATLAS extension on the exact tab you approve and paste this token.</small></div>`;notice("Browser pairing token created.");}catch(error){notice(error.message,true);} };
$("#observationForm").onsubmit = async (event) => { event.preventDefault(); const form=event.currentTarget,data=formObject(form); data.consent=form.elements.consent.checked; try { await request("/api/observations", { method: "POST", body: JSON.stringify(data) }); form.reset(); notice("Recording started in the approved tab."); await refresh(); } catch (error) { notice(error.message, true); } };
$("#browserActionForm").onsubmit = async (event) => { event.preventDefault();const data=formObject(event.currentTarget),session=(state.browser?.sessions??[]).find(item=>item.id===data.sessionId);if(!session)return notice("Connect an approved tab first.",true);const args=data.action==="navigate"?{url:data.target}:data.action==="scroll"?{y:Number(data.value||500)}:{selector:data.target,...(["type","select"].includes(data.action)?{[data.action==="type"?"text":"value"]:data.value}:{})};try{await request("/api/browser/commands",{method:"POST",body:JSON.stringify({sessionId:session.id,managerId:session.manager_id,action:data.action,args})});notice("Browser action queued through the environment Manager.");await refresh();}catch(error){notice(error.message,true);} };
$("#actorForm").onsubmit = async (event) => {
  event.preventDefault();
  const form=event.currentTarget,data=formObject(form);
  const payload={name:data.name,identity:data.identity,personality:data.personality,relationship:data.relationship,availability:data.availability,
    routineTasks:[{title:data.routineTitle,intention:data.routineIntention,timingText:data.timingText,required:form.elements.routineRequired.checked}]};
  try{await request("/api/actors",{method:"POST",body:JSON.stringify(payload)});form.reset();form.elements.routineRequired.checked=true;notice("Actor draft created. Teach Skills and assess an environment when ready.");await refresh();}catch(error){notice(error.message,true);}
};
$("#runForm").onsubmit = (event) => { event.preventDefault(); submit(event.currentTarget, "/api/runs", "Temporary agent deployed through its Manager."); };
$("#runDiskSpace").onclick = async () => {
  const environmentId = $("#runEnvironment").value;
  if (!environmentId) return notice("Connect an environment first.", true);
  try {
    await request("/api/runs/disk-space", { method: "POST", body: JSON.stringify({ environmentId }) });
    notice("Manager deployed a permission-scoped disk inspection agent.");
    await refresh();
  } catch (error) { notice(error.message, true); }
};
$("#messengerForm").onsubmit = async (event) => {
  event.preventDefault();
  const data = formObject(event.currentTarget);
  event.currentTarget.reset();
  await sendChat(data.message);
};

document.querySelectorAll(".model-role-form").forEach((form) => form.onsubmit = async (event) => { event.preventDefault(); const role=form.dataset.role;try{await request(`/api/settings/models/${role}`,{method:"POST",body:JSON.stringify(formObject(form))});notice(role === "ada" ? "ADA model applied immediately." : "Manager and agent model applied immediately.");await refresh();}catch(error){notice(error.message,true);} });
document.querySelectorAll("[data-test-role]").forEach((button) => button.onclick = async () => { const role=button.dataset.testRole;try{const result=await request(`/api/settings/models/${role}/test`,{method:"POST",body:"{}"});document.querySelector(`[data-role-result="${role}"]`).innerHTML=`<div class="notice">${esc(result.status)} · ${esc(result.model)} · ${esc(result.detail)}</div>`;}catch(error){notice(error.message,true);} });
$("#secretForm").onsubmit = async (event) => { event.preventDefault(); try{await request("/api/settings/secrets",{method:"POST",body:JSON.stringify(formObject(event.currentTarget))});event.currentTarget.reset();notice("Encrypted secret reference created.");await refresh();}catch(error){notice(error.message,true);} };
$("#permissionForm").onsubmit = async (event) => { event.preventDefault(); const form=event.currentTarget; const environmentId=form.elements.environmentId.value; const payload={tools:form.elements.diskTool.checked?["system.disk_space"]:[],filesystemScope:form.elements.filesystemScope.value,networkEnabled:form.elements.networkEnabled.checked}; try{await request(`/api/settings/environments/${environmentId}/permissions`,{method:"POST",body:JSON.stringify(payload)});notice("Environment permissions saved.");await refresh();}catch(error){notice(error.message,true);} };
$("#runDiagnostics").onclick = async () => { try{const result=await request("/api/settings/diagnostics",{method:"POST",body:"{}"});$("#adminResult").innerHTML=`<div class="pre">${esc(JSON.stringify(result,null,2))}</div>`;}catch(error){notice(error.message,true);} };
$("#createBackup").onclick = async () => { try{await request("/api/settings/backups",{method:"POST",body:"{}"});notice("Verified backup created.");await refresh();}catch(error){notice(error.message,true);} };

refresh().catch((error) => notice(error.message, true));
