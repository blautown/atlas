# ATLAS project roadmap

This roadmap is the repository-owned source of truth for turning the current bootstrap into a self-extensible operating platform. Its structured counterpart is [`config/roadmap.json`](../config/roadmap.json), which is loaded by ATLAS and supplied to the Development Assistant.

## Purpose

After the initial installation, a non-technical user should be able to configure environments, teach workflows, create and supervise agents, resolve exceptions, and improve ATLAS primarily through the dashboard.

## Build order

1. **M1 — Complete the real local execution loop**
   Build the permissioned tool broker and prove one real Manager-supervised disk-space workflow from dashboard launch through verified result and temporary-agent cleanup.
2. **M2 — Dashboard-operated platform settings**
   Move provider selection, encrypted secret references, diagnostics, runtime administration, backups, and environment permissions into ATLAS.
3. **M3 — Secure environment connector protocol**
   Package the environment runtime and connect local or remote physical environments through outbound authenticated real-time channels.
4. **M4 — Remote active-browser connection**
   Add a consent-based browser bridge or extension for approved sessions and tabs without exposing raw debugging ports.
5. **M5 — Task observation and workflow learning**
   Observe a user completing work, infer the workflow, produce an asset and permission report, rehearse it, and require approval before autonomy.
6. **M6 — Development Assistant engineering loop**
   Add multi-step inspection, transactional edits, automated correction, rollback, decision records, and roadmap progress updates.
7. **M7 — Authentication, remote control plane, and mobile readiness**
   Add secure remote state, events, device enrollment, HITL, emergency controls, and Android-ready contracts.
8. **M8 — Android supervisory client**
   Build monitoring, Manager conversation, task deployment, notifications, biometric HITL, results, and emergency controls.
9. **M9 — Production hardening and installer**
   Deliver a signed installer, automatic service setup, secure updates, backup recovery, observability, and operational documentation.

## Development Assistant behavior

The Development Assistant receives the structured roadmap on every request. Dashboard roadmap actions send an automatic prompt containing the milestone identifier, objective, deliverables, acceptance criteria, and required verification.

The Assistant must inspect the repository before changing it, preserve coherent architecture, implement complete vertical slices, request scoped approvals, run verification, update status only with evidence, and report risks honestly.

Detailed milestone deliverables and acceptance criteria live in [`config/roadmap.json`](../config/roadmap.json).
