# Package Interfaces

The canonical domain service exposes two package validation entry points:

- validateWorkforcePackage
- validateBusinessPackage

Both methods validate schema-version compatibility, ensure required metadata is present, and normalize payloads into a neutral package structure that can be stored or transported without coupling to the runtime.
