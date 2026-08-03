# Legacy Migration Map

## Legacy actor -> canonical operator

The service method mapLegacyActorToOperator converts a legacy actor payload into a canonical operator-compatible shape. It preserves the actor identity and maps the role into an operator type.

## Legacy manager -> canonical environment manager

The service method mapLegacyManagerToEnvironmentManager converts a legacy manager payload into a canonical environment-manager-compatible shape. Ambiguous scope metadata emits a warning rather than assuming an environment assignment.
