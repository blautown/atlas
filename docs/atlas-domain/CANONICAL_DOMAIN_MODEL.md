# Canonical Domain Model

This document captures the additive canonical domain model introduced for Stage 1. The model stays separate from the existing ATLAS runtime and uses prefixed canonical tables so it can coexist with the current actor, registry, and environment concepts.

## Core entities

- Founder company
- Business
- Workforce
- Cell
- Position
- Operator
- Persona
- Environment
- Environment manager
- Skill
- Dependency
- Capability
- Session
- Credential reference
- Schedule
- Execution
- Approval
- Audit event

## Design principles

- Additive only: no replacement of the existing ATLAS runtime path.
- Stable identifiers: every entity has a generated ID and lifecycle state.
- Relationship awareness: position assignments are tracked independently from personae and positions.
- Compatibility-first: legacy actor and manager concepts can be mapped into canonical operator and environment manager shapes without forcing runtime changes.
