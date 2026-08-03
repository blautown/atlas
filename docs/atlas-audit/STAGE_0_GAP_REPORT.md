# Stage 0 gap report

## What is already implemented

The repository is not a blank scaffold. It already includes the following capabilities:

- a working control plane and UI
- SQLite-backed persistence with schema evolution through migrations
- provider abstraction and settings-driven model selection
- an execution loop with run control and temporary-agent lifecycle management
- signed connector integration and a browser bridge
- observation-driven workflow drafting and rehearsal
- actor lifecycle, skills, deployment assessment, and health gates

## Remaining or uncertain areas

### 1. Verification evidence is only partially surfaced

The runtime and audit layers are present, but the audit should still verify that every sensitive workflow is consistently backed by visible, user-readable evidence in the UI and persisted records.

### 2. Operational hardening

The roadmap suggests a more mature production packaging and servicing layer, but the current workspace shows the runtime and service implementation rather than a fully packaged operating environment.

### 3. Human-in-the-loop completeness

Approvals and governance flows exist, but the audit should confirm that sensitive write paths remain consistently routed through these gates.

### 4. Capability tiering

The provider layer is configurable, but the audit did not find evidence of a fully enforced role-based capability model beyond configuration persistence.

### 5. Cross-surface consistency

The implementation spans server, runtime, browser extension, migrations, and tests; those surfaces appear coherent, but the audit should keep future changes narrow and test-backed.

## Risk assessment

- Low risk for the current documentation-only Stage 0 task: the repository is already substantial and the architecture is visible.
- Medium risk for future implementation work: the subsystems are intertwined and should be changed incrementally.
- Medium risk for roadmap completion: some roadmap milestones are reflected in code, but the audit should verify operational evidence before treating them as fully complete.
