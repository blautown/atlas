let state = null;
let activeChat = { kind: "development", ownerId: "development" };
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
  state = await request("/api/state");
  render();
}

function latestJob(kind, ownerId, milestoneId) {
  const matches = state.jobs.filter((job) => job.kind === kind && (!ownerId || job.owner_id === ownerId) && (!milestoneId || job.milestone_id === milestoneId));
  return matches.find((job) => !["completed", "failed"].includes(job.status)) ?? matches[0];
}

function render() {
  const c = state.capacity;
  $("#fleetState").textContent = c.environmentsTotal ? `${c.environmentsOnline} of ${c.environmentsTotal} environments online` : "Ready for first environment";
  $("#providerStatus").innerHTML = `<p class="nav-label">PROVIDERS</p><strong>${esc(state.providers.model)}</strong><small>Model</small><strong>${esc(state.providers.execution)}</strong><small>Execution</small>`;
  $("#metrics").innerHTML = [
    ["Operational capacity", `${c.score}%`, "Available supervised workload"],
    ["Environment fleet", `${c.environmentsOnline}/${c.environmentsTotal}`, "Online and connected"],
    ["Active work", c.activeRuns, "Tasks currently executing"],
    ["Needs attention", state.approvals.filter((a) => a.status === "pending").length, "Pending your decision"]
  ].map(([label, value, detail]) => `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`).join("");

  const envItems = state.environments.map((env) => `<div class="item">
    <div class="item-head"><div><strong>${esc(env.name)}</strong><small>${esc(env.kind)} environment</small></div>${badge(env.status)}</div>
    <div class="manager-row"><div><span class="mini-avatar">${esc(initials(env.manager_name))}</span><span><strong>${esc(env.manager_name)}</strong><small>Dedicated AI Manager · ${esc(env.manager_status)}</small></span></div><button data-chat-kind="manager" data-owner="${esc(env.manager_id)}">Message</button></div>
  </div>`);
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

  const runItems = state.runs.map((run) => `<div class="item compact"><div class="item-head"><div><strong>${esc(run.objective)}</strong><small>${fmt(run.started_at)} · ${esc(run.result ?? run.error ?? "In progress")}</small></div>${badge(run.status)}</div></div>`);
  $("#runSummary").innerHTML = runItems.length ? list(runItems.slice(0, 5)) : empty("No execution yet", "Deploy a task when you are ready.");
  $("#runList").innerHTML = runItems.length ? list(runItems) : empty("No execution history", "Completed and active task runs will appear here.");
  $("#runCount").textContent = state.runs.length;

  $("#agentList").innerHTML = state.agents.length ? list(state.agents.map((agent) => `<div class="item compact"><div class="item-head"><div><strong>${esc(agent.name)}</strong><small>${esc(agent.lifecycle)} · ${esc(agent.objective)}</small></div>${badge(agent.status)}</div></div>`)) : empty("No agents created", "Create a persistent profile or deploy a task agent.");
  $("#workflowList").innerHTML = state.workflows.length ? list(state.workflows.map((workflow) => `<div class="item"><div class="item-head"><div><strong>${esc(workflow.name)}</strong><small>${esc(workflow.learning_mode)} · ${esc(workflow.trigger_type)} ${esc(workflow.trigger_value ?? "")}</small></div>${badge(workflow.enabled ? "enabled" : "disabled")}</div><p>${esc(workflow.instruction)}</p></div>`)) : empty("No learned workflows", "Teach a Manager with instructions, observation, or both.");
  $("#agentCount").textContent = state.agents.length;
  $("#workflowCount").textContent = state.workflows.length;

  $("#auditList").innerHTML = state.audit.length ? list(state.audit.map((event) => `<div class="item compact"><div class="item-head"><div><strong>${esc(event.action)}</strong><small>${esc(event.actor_type)} → ${esc(event.entity_type)} · ${fmt(event.created_at)}</small></div></div></div>`)) : empty("No activity recorded", "Actions taken through ATLAS will be recorded here.");
  $("#approvalCount").textContent = pending.length;
  $("#auditCount").textContent = state.audit.length;

  const roadmap = state.roadmap ?? { milestones: [] };
  $("#roadmapPurpose").textContent = roadmap.purpose ?? "Roadmap unavailable.";
  $("#roadmapList").innerHTML = roadmap.milestones?.length ? `<div class="roadmap">${roadmap.milestones.map((milestone, index) => `<div class="roadmap-item">
    <div class="roadmap-index">${String(index + 1).padStart(2, "0")}</div>
    <div class="roadmap-body"><div class="item-head"><div><strong>${esc(milestone.title)}</strong><small>${esc(milestone.id)} · ${esc(milestone.deliverables.length)} deliverables</small></div>${badge(milestone.status)}</div><p>${esc(milestone.objective)}</p>${renderMilestoneProgress(milestone.id)}<div class="actions"><button class="secondary" data-roadmap="${esc(milestone.id)}" data-roadmap-action="discuss">Discuss</button><button data-roadmap="${esc(milestone.id)}" data-roadmap-action="implement">Start milestone</button></div></div>
  </div>`).join("")}</div>` : empty("Roadmap unavailable", "ATLAS could not load the repository roadmap.");

  for (const select of [$("#runEnvironment"), $("#agentEnvironment")]) {
    const current = select.value;
    select.innerHTML = state.environments.map((env) => `<option value="${env.id}">${esc(env.name)} · ${esc(env.status)}</option>`).join("");
    if (current) select.value = current;
  }

  renderChatDock();
  renderMessenger();
  bindDynamic();
}

function initials(value) {
  return String(value ?? "AI").split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function renderChatDock() {
  const devJob = latestJob("development");
  const buttons = [`<button class="chat-launcher ${activeChat.kind === "development" ? "selected" : ""}" data-chat-kind="development" data-owner="development" aria-label="Open Development Assistant" title="Development Assistant"><span>DA</span>${jobSignal(devJob)}</button>`];
  for (const manager of state.managers) {
    const job = latestJob("manager", manager.id);
    buttons.push(`<button class="chat-launcher ${activeChat.kind === "manager" && activeChat.ownerId === manager.id ? "selected" : ""}" data-chat-kind="manager" data-owner="${esc(manager.id)}" aria-label="Open ${esc(manager.name)}" title="${esc(manager.name)}"><span>${esc(initials(manager.name))}</span>${jobSignal(job, manager.status)}</button>`);
  }
  $("#chatDock").innerHTML = `<small class="dock-label">CHAT</small>${buttons.join("")}`;
}

function jobSignal(job, fallback = "ready") {
  const status = job?.frozen ? "frozen" : job?.status ?? fallback;
  const signal = badStatuses.includes(status) || status === "frozen" ? "bad" : warnStatuses.includes(status) || ["running", "queued"].includes(status) ? "busy" : "";
  return `<i class="launcher-signal ${signal}" aria-hidden="true"></i>`;
}

function chatDetails() {
  if (activeChat.kind === "development") return { title: "Development Assistant", subtitle: "Builds and maintains ATLAS", avatar: "DA", placeholder: "Ask for a platform change or discuss the roadmap…", hint: "Repository changes remain approval-controlled." };
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
  const messages = state.messages.filter((message) => message.conversation_kind === activeChat.kind && (activeChat.kind === "development" || message.owner_id === activeChat.ownerId));
  $("#messengerMessages").innerHTML = messages.length ? messages.map(renderMessage).join("") : empty(activeChat.kind === "development" ? "Start building with ATLAS" : "Start a Manager conversation", activeChat.kind === "development" ? "Discuss the roadmap or request a platform improvement." : "Define work in plain English; the Manager will plan and supervise it.");
  const job = latestJob(activeChat.kind, activeChat.kind === "manager" ? activeChat.ownerId : null);
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

function renderMilestoneProgress(milestoneId) {
  const job = latestJob("development", null, milestoneId);
  if (!job) return "";
  const stateLabel = job.frozen ? "No heartbeat — may need attention" : job.stage;
  return `<div class="work-status ${job.frozen ? "frozen" : ""}"><div class="item-head"><span>${esc(stateLabel)}</span>${badge(job.status)}</div><div class="progress"><span style="width:${Number(job.progress)}%"></span></div><small>${Number(job.progress)}% · updated ${fmt(job.updated_at)}</small></div>`;
}

function renderMessage(message) {
  return `<div class="message ${esc(message.role)}"><div class="message-meta"><strong>${message.role === "user" ? "You" : activeChat.kind === "development" ? "Development Assistant" : "AI Manager"}</strong><small>${fmt(message.created_at)}</small></div><p>${esc(message.content)}</p></div>`;
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
    ${job.error ? `<p class="error-text">${esc(job.error)}</p>` : ""}
  </div>`;
}

function bindDynamic() {
  bindChatLaunchers();
  document.querySelectorAll("[data-roadmap]").forEach((button) => button.onclick = async () => {
    const milestone = state.roadmap.milestones.find((item) => item.id === button.dataset.roadmap);
    if (!milestone) return notice("Roadmap milestone not found.", true);
    const prompt = button.dataset.roadmapAction === "implement"
      ? `Begin roadmap milestone ${milestone.id}: ${milestone.title}. Inspect the repository before changing it. Implement the smallest complete vertical slice that advances its objective and acceptance criteria. Preserve system integrity, request scoped approvals for writes and commands, run the full verification suite, and report evidence, risks, and remaining work. Do not mark the milestone complete unless every acceptance criterion is demonstrated.`
      : `Review roadmap milestone ${milestone.id}: ${milestone.title}. Explain its purpose, dependencies, deliverables, acceptance criteria, current repository readiness, and the safest next implementation slice. Do not make changes in this discussion.`;
    openChat("development", "development");
    await sendChat(prompt);
  });
  document.querySelectorAll("[data-approval]").forEach((button) => button.onclick = async () => {
    try {
      await request(`/api/approvals/${button.dataset.approval}`, { method: "POST", body: JSON.stringify({ decision: button.dataset.decision }) });
      notice(`Request ${button.dataset.decision}.`);
      await refresh();
    } catch (error) { notice(error.message, true); }
  });
}

function watchJob(jobId) {
  clearInterval(jobPoll);
  jobPoll = setInterval(async () => {
    await refresh();
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job || ["completed", "failed", "waiting_approval", "needs_input"].includes(job.status)) clearInterval(jobPoll);
  }, 1000);
}

const viewMeta = {
  overview: ["Overview", "System capacity, activity, and anything that needs you."],
  environments: ["Environments", "Connect execution targets and work with their dedicated Managers."],
  workforce: ["Work", "Create agents, deploy tasks, and follow execution."],
  development: ["Roadmap", "Guide the safe evolution of ATLAS from inside ATLAS."],
  audit: ["Governance", "Approve sensitive actions and inspect the activity trail."]
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

async function sendChat(message) {
  try {
    const endpoint = activeChat.kind === "development" ? "/api/development/chat" : `/api/managers/${activeChat.ownerId}/chat`;
    const job = await request(endpoint, { method: "POST", body: JSON.stringify({ message }) });
    await refresh();
    openChat(activeChat.kind, activeChat.ownerId);
    watchJob(job.id);
  } catch (error) { notice(error.message, true); }
}

document.querySelectorAll(".nav").forEach((button) => button.onclick = () => showView(button.dataset.view));
document.querySelectorAll("[data-go]").forEach((button) => button.onclick = () => showView(button.dataset.go));
$("#refresh").onclick = () => refresh().then(() => notice("ATLAS state refreshed.")).catch((error) => notice(error.message, true));
$("#openDevChat").onclick = () => openChat("development", "development");
$("#minimiseMessenger").onclick = () => $("#messenger").classList.add("hidden");
$("#closeMessenger").onclick = () => $("#messenger").classList.add("hidden");
$("#environmentForm").onsubmit = (event) => { event.preventDefault(); submit(event.currentTarget, "/api/environments", "Environment connected and Manager assigned."); };
$("#agentForm").onsubmit = (event) => { event.preventDefault(); submit(event.currentTarget, "/api/agents", "Persistent agent created."); };
$("#runForm").onsubmit = (event) => { event.preventDefault(); submit(event.currentTarget, "/api/runs", "Temporary agent deployed through its Manager."); };
$("#messengerForm").onsubmit = async (event) => {
  event.preventDefault();
  const data = formObject(event.currentTarget);
  event.currentTarget.reset();
  await sendChat(data.message);
};

refresh().catch((error) => notice(error.message, true));