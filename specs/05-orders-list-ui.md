# Spec 05 — Orders List Interface

## Objective

Deliver a responsive search interface whose final state always matches the latest filters.

## Dependencies

- Specs 02 and 04 accepted.

## Scope

- Session-aware orders page.
- Search, status, sort, direction, and forward pagination.
- URL query state and debounced search.
- Native-fetch hook using abort plus monotonic sequence.
- Loading, empty, error, and retry states.
- Development-only latency simulation.

## Acceptance criteria

- Browser receives one bounded API page at a time.
- Search waits about 300 ms; status/sort apply immediately.
- One-to-two-character search shows guidance and sends no search request.
- Query state appears in the URL without an RSC request per keystroke.
- Parameter changes abort the previous request when possible.
- Only the newest sequence may commit data, error, or loading completion.
- Unmount aborts the active request.
- Three rapid changes always finish with the third filter’s data.
- Existing rows remain visible but dimmed during replacement loading.
- Empty/error states are visible and errors offer Retry.
- Simulated latency is configurable in development and disabled in production.

## Verification

- Deterministic test resolves requests out of order and asserts final request-3 state.
- Manual rapid-filter test with 200–1500 ms latency.
- Network inspection confirms bounded pages and cancellations where supported.

## Review checklist

- [ ] Abort is resource control, not the sole correctness guard.
- [ ] Stale success, error, and cleanup branches cannot mutate current state.
- [ ] Cursor resets on query-context changes.
- [ ] Controls are labeled and keyboard usable.
- [ ] No redundant remote-state framework is introduced.

## Commit

```text
feat(web): add searchable orders console
```
