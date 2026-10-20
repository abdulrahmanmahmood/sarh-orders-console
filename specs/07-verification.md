# Spec 07 — Correctness Proofs

## Objective

Produce reproducible evidence for the highest-risk correctness and security claims.

## Dependencies

- Specs 01–06 accepted.

## Concurrent duplicate proof

- Authenticate as seeded agent and capture the cookie.
- Send the configured valid Origin.
- Generate a unique email and one key.
- Send 20 identical requests concurrently, exceeding pool size 10.
- Fail after 15 seconds with a possible-pool-deadlock diagnostic.
- Assert one `201`, nineteen `200` replays, and one order ID.
- Verify directly: one order, expected items, one idempotency row.
- Reuse the key with another payload and assert `409`.

## Rapid-filter proof

- Resolve three mocked list requests out of order.
- Assert only request 3 owns final data, error, and loading state.
- Perform manual three-filter flow with visible latency.

## Authorization proof

- No cookie → `401`.
- Agent delete → `403`.
- Admin delete → success and absence from active list.
- Invalid Origin on unsafe request → `403`.

## Acceptance criteria

- Each proof has one documented command and deterministic pass/fail output.
- Duplicate proof verifies database cardinality, not only HTTP responses.
- Tests use unique records and do not depend on a dirty database.
- Failures exit non-zero with actionable messages.
- Mandatory suite completes without hanging.

## Review checklist

- [ ] Duplicate proof runs against PostgreSQL, not mocks.
- [ ] Requests are truly concurrent, not sequential.
- [ ] Pool timeout is a regression check, not claimed as formal proof.
- [ ] Rapid-filter test covers stale success and cleanup behavior.
- [ ] Security tests call the API directly.

## Evidence

- Recording-friendly terminal output for R2.
- Test output for stale-response correctness.
- Concise authorization summary.

## Commit

```text
test: prove concurrency race and authorization guarantees
```
