# Entity Relationships

## Position and operator

A position may exist without an operator. An operator may exist without a position. When an operator is assigned to a position, the assignment is recorded as a separate history row and the position stores the current operator reference.

## Persona separation

Personas are modeled independently from operators and positions. An operator can reference a persona without changing the position model or collapsing identity into the operator record.

## Workforce and business

A workforce may register without a business, and a business may register without an associated workforce. This keeps the canonical model neutral and compatible with existing bootstrap flows.
