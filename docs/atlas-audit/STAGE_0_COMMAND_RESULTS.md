# Stage 0 verification report

## Commands executed

From the repository root, the following commands were run:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run smoke`

## Observed results

### Typecheck

Result: passed.

Evidence:

```text
> atlas@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
```

### Lint

Result: passed.

Evidence:

```text
> atlas@0.1.0 lint
> tsc -p tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters
```

### Test suite

Result: passed with 35 tests and 0 failures.

Evidence:

```text
ℹ tests 35
ℹ pass 35
ℹ fail 0
```

### Smoke script

Result: failed because the local server was not listening on the expected port.

Evidence:

```text
[TypeError: fetch failed]
Error: connect ECONNREFUSED 127.0.0.1:4311
```

## Verification conclusion

The repository is currently in a valid, test-passing state for the documented audit scope. The smoke failure is environmental and indicates that the runtime server must be started before that script can succeed.
