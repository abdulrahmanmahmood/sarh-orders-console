# SARH Orders Console

A Next.js and NestJS operations console for searching 50,000+ PostgreSQL orders and safely registering phone orders without technical duplicates.

## Architecture

```text
Next.js browser UI → /api rewrite → NestJS guards/controllers/services → TypeORM → PostgreSQL 16
```

The list uses forward keyset pagination and query-specific indexes. Creation uses a PostgreSQL transaction and a unique `(user_id, key)` idempotency claim. Authorization, validation, totals, and duplicate prevention are enforced on the server/database—not by hidden UI controls.

## Start locally

Requirements: Node.js 20.9+, npm, and Docker with Compose.

```bash
cp .env.example .env
npm run install:all
npm run db:up
npm run db:migrate
npm run db:seed
```

Start these in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Open `http://localhost:3000`. PostgreSQL binds host port 5433 to avoid common local conflicts.

Development users share password `SarhDemo2026!`:

- Agent: `agent@sarh.local`
- Admin: `admin@sarh.local`

## Commands

```bash
npm run typecheck
npm run build
npm --prefix frontend test
npm --prefix backend run proof:duplicates  # API must be running
npm --prefix backend run seed -- --reset   # explicitly replaces local data
```

The seed creates 50,000 orders and 150,000± items in about 19 seconds on the development environment. It refuses to overwrite a non-empty table unless `--reset` is supplied.

## API

| Method | Path | Access |
|---|---|---|
| POST | `/api/auth/login` | Public + Origin check |
| POST | `/api/auth/logout` | Public, idempotent + Origin check |
| GET | `/api/auth/me` | Authenticated |
| GET | `/api/orders` | Agent/admin |
| POST | `/api/orders` | Agent/admin + `Idempotency-Key` |
| DELETE | `/api/orders/:id` | Admin only; soft delete |

List parameters are `search`, `status`, `sort`, `direction`, `limit`, and opaque `cursor`. Search requires three characters. The API returns at most 100 rows and never returns the full table.

## Performance evidence

Measured with 50,000 seeded orders and 150,365 items:

| Query | Plan | Execution |
|---|---|---:|
| Active orders by newest date, limit 51 | `idx_orders_created_id` index scan | 0.36 ms |
| Pending orders by amount, limit 51 | backward index-only scan on `idx_orders_status_amount_id` | 0.17 ms |
| Name/email substring `customer123` | bitmap OR of both trigram indexes, top-N sort | 38.03 ms |

The schema also provides no-status amount sorting, status/date sorting, lowercase trigram search indexes, and `order_items(order_id)`. PostgreSQL may legitimately choose different plans on other hardware/distributions; these are measured observations, not guarantees.

## Correctness evidence

`npm --prefix backend run proof:duplicates` sends 20 identical requests concurrently with one key. The verified run produced one `201`, nineteen `200` replays, one unique order ID, one database order, one item set, one key row, and `409` for reuse with changed data.

For a visible R1 recording, set the following only in local development and restart the API:

```env
SIMULATE_LATENCY_MIN_MS=200
SIMULATE_LATENCY_MAX_MS=1500
```

The frontend combines request cancellation with a sequence guard; the sequence is the final protection against stale success, error, and cleanup paths.

## Review of the supplied authentication code

1. `jwt.decode()` verifies no signature, so anyone can forge an admin payload; the implementation uses `verify` with algorithm, issuer, audience, and expiry.
2. Delete checked only token presence while React performed the admin check; a server-side roles guard now owns authorization.
3. Raw login values can become ORM operator objects (for example `{ "not": "" }`) and bypass authentication in object-filter ORMs; strict DTOs require strings before querying.
4. Plaintext password lookup exposes every password; seeded passwords use scrypt and timing-safe comparison.
5. The committed secret is compromised and must be rotated, not merely moved; startup now requires an environment secret of at least 32 bytes.
6. Tokens had no `expiresIn`; verified JWTs now expire after one eight-hour shift.
7. Query-string tokens leak through logs, history, and referrers; only an HttpOnly cookie is accepted.
8. Hard deletion of financial records had no audit/recovery path; deletion now records `deleted_at` and `deleted_by`.
9. Delete returned success for missing records; missing/already-deleted orders now return `404`.
10. Login had no brute-force control; local login is rate-limited per IP.

The JWT is stored in an `HttpOnly`, `SameSite=Strict` cookie on the single origin exposed by the Next.js proxy. JavaScript cannot read the token, while SameSite plus exact Origin validation mitigate CSRF; this does not stop XSS from making authenticated requests inside the page, so React escaping and a restrictive production CSP still matter.

## Product question: “Delete all cancelled orders”

I would ask why deletion is needed, what audit/retention rules apply, whether cancellation is reversible, and who authorizes it. If those answers are unavailable, I would propose hiding or archiving cancelled orders with a preview count, retention policy, audit trail, and restore path—not irreversible bulk deletion.

## What I skipped and why

- Optional O1/O2: mandatory correctness and documentation have priority within the six-hour brief.
- Previous-page navigation, page numbers, and exact totals: forward keyset pagination keeps the required path fast and deterministic.
- Automated browser E2E: the focused hook proof, API proof, builds, and manual acceptance checks cover the scored risks; broader browser coverage is the first follow-up.
- Distributed throttling, refresh tokens, account management, and CSP deployment headers: production concerns outside this local slice, documented in the design notes.
- Cross-agent business duplicate rejection: idempotency cannot identify two independent entries without a reliable business key; a similarity warning is safer than automatic rejection.

See [DECISIONS.md](./DECISIONS.md), [SCALE.md](./SCALE.md), [SPEC.md](./SPEC.md), and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

