# Spec 01 — Foundation, Schema, Indexes, and Seed

## Objective

Create the runnable Next.js/NestJS/PostgreSQL foundation and database invariants before feature code depends on them.

## Dependencies

- Spec 00 accepted.
- Node, package manager, and PostgreSQL delivery method chosen.

## Scope

- `frontend/` and `backend/` TypeScript applications.
- PostgreSQL configuration, environment validation, and migrations.
- `users`, `orders`, `order_items`, and `idempotency_keys`.
- `TIMESTAMPTZ(3)`, integer cents, soft deletion, and constraints.
- Lowercase-expression email uniqueness.
- Partial trigram and composite keyset indexes.
- Deterministic set-based seed of 50,000+ orders and two users.

## Acceptance criteria

- A new database migrates from empty without manual SQL.
- At least 50,000 orders exist, each with one to five items.
- Stored totals equal `SUM(quantity * unit_price_cents)`.
- User emails are unique case-insensitively.
- PostgreSQL rejects invalid money, quantities, references, and soft-delete pairs.
- Idempotency uniqueness is exactly `(user_id, key)`.
- Active-order indexes include `WHERE deleted_at IS NULL` where designed.
- Seed covers all statuses and useful date/amount ranges.
- Seed is reproducible, reports elapsed time, and requires `--reset` before overwriting data.
- `.env.example` is complete and no real secret is committed.

## Verification

- Run migrations on a clean database.
- Record seed row/item counts and duration.
- Query for totals differing from item sums; expect zero rows.
- Inspect `pg_indexes` and constraints.
- Attempt representative invalid inserts and confirm rejection.

## Review checklist

- [ ] `synchronize` is disabled outside throwaway tests.
- [ ] Seed uses set-based/batched insertion, not per-row `save()`.
- [ ] `BIGINT` mapping and safe bounds are documented.
- [ ] `TIMESTAMPTZ(3)` matches cursor precision.
- [ ] Schema supports soft deletion and idempotent replay.

## Risks and limits

GIN indexes increase write cost and must be measured. Dependency-download time is excluded from the five-minute local startup target.

## Commits

```text
chore: initialize Next Nest and PostgreSQL workspace

feat(db): add order schema indexes and deterministic seed
```

The scaffold commit contains configuration and the smallest health/startup path. The database commit contains migrations, entities, indexes, and seed behavior; both must remain runnable.
