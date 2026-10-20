# Orders Console — Implementation Plan (v3)

Revision of v2. Fixes four design bugs found in review and folds in the smaller corrections.

Product requirements and acceptance criteria: [SPEC.md](./SPEC.md)

## 0. Changes from v2

| # | Problem in v2 | Fix in v3 |
|---|---|---|
| 1 | `idempotency_keys.order_id` FK had no delete behaviour, so deleting an API-created order failed with an FK violation. v2 also said "prefer soft deletion" but the schema had no column for it. | **Soft delete** (`deleted_at`, `deleted_by`). Orders are never physically deleted, so the FK stays `RESTRICT`. List queries and indexes are partial on `deleted_at IS NULL`. (§4, §10) |
| 2 | `TIMESTAMPTZ` stores microseconds but JS `Date` holds milliseconds, so cursors lost precision and keyset pages skipped or repeated rows. | Column is `TIMESTAMPTZ(3)`. Cursors use row-value comparison. (§4, §7) |
| 3 | The "use the transaction-scoped manager" rule was dropped. An injected repository inside the transaction takes a second pool connection, which deadlocks the pool under 20 concurrent requests and breaks atomicity. | Every query in the transaction goes through `manager`. Isolation is pinned to `READ COMMITTED`. The proof deliberately exceeds the pool size. (§6) |
| 4 | With an `HttpOnly` cookie the client can't read the role or clear the session, and a "short-lived" token with no refresh logs reviewers out mid-test. | Adds `GET /api/auth/me` and `POST /api/auth/logout`. Token lifetime is 8 h (one shift) and is justified. (§9, §11) |
| — | Smaller fixes | LIKE wildcard escaping. Cursor bound to sort and filters (no signing). Loading/empty/error states restored. Security finding #2 reworded precisely. Unique email per proof run. Vitest for the rapid-filter test. `crypto.scrypt` instead of Argon2. Explicit cents API contract. Write DECISIONS while coding. Unsafe-method Origin validation, public idempotent logout, and one JWT-based role source are explicit. |

---

## 1. Scope and priorities

1. Database schema, indexes, fast seed.
2. Secure authentication and server-side authorization.
3. R2 transactional idempotent order creation.
4. R1 paginated search, filter, sort.
5. Next.js list and create form.
6. Three focused correctness proofs.
7. README, `DECISIONS.md`, `SCALE.md`, recording.

No optional feature until every mandatory artifact is complete.

## 2. Project structure

```text
orders-console/
├── frontend/            # Next.js (App Router), React, TypeScript
├── backend/             # NestJS, TypeORM, PostgreSQL
├── docker-compose.yml   # PostgreSQL only (README also documents DATABASE_URL for a local install)
├── README.md
├── DECISIONS.md
├── SCALE.md
└── .env.example
```

No shared contracts package. The few API types are duplicated on purpose.

## 3. Backend request pipeline

```text
HTTP → ValidationPipe → AuthGuard (cookie JWT) → RolesGuard → Controller → Service → manager/query object → PostgreSQL
```

- Controllers handle HTTP only.
- DTOs validate untrusted input. `whitelist` and `forbidNonWhitelisted` are on.
- Guards handle authentication (global, with `@Public()` opt-out) and roles.
- Services own business rules and transaction boundaries.
- A query object owns list filtering, cursor, and sort logic.
- PostgreSQL constraints provide the concurrency guarantees.

No generic repositories, CQRS, event sourcing, or speculative interfaces.

## 4. Database schema

### `users`

```text
id             UUID PRIMARY KEY
email          TEXT NOT NULL                 -- stored lowercase; expression index below is unique
password_hash  TEXT NOT NULL                 -- scrypt$N$r$p$salt$hash
role           user_role NOT NULL            -- 'admin' | 'agent'
created_at     TIMESTAMPTZ(3) NOT NULL DEFAULT now()
```

The migration also creates `UNIQUE INDEX users_email_lower_unique ON users (lower(email))`, so uniqueness does not depend only on application-side normalization.

### `orders`

```text
id                  UUID PRIMARY KEY
customer_name       TEXT NOT NULL
customer_email      TEXT NOT NULL            -- stored lowercase
status              order_status NOT NULL DEFAULT 'pending'
                    -- 'pending' | 'processing' | 'completed' | 'cancelled'
total_amount_cents  BIGINT NOT NULL CHECK (total_amount_cents >= 0)
created_by          UUID NULL REFERENCES users(id)     -- NULL for seeded rows
created_at          TIMESTAMPTZ(3) NOT NULL DEFAULT now()
deleted_at          TIMESTAMPTZ(3) NULL
deleted_by          UUID NULL REFERENCES users(id)
CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
```

`TIMESTAMPTZ(3)` matches JS `Date` precision exactly, so a timestamp read into JS and written back into a cursor round-trips without loss. **(Fix 2)**

### `order_items`

```text
id                UUID PRIMARY KEY
order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT
name              TEXT NOT NULL
quantity          INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000)
unit_price_cents  BIGINT NOT NULL CHECK (unit_price_cents >= 0)
```

### `idempotency_keys`

```text
id            UUID PRIMARY KEY
user_id       UUID NOT NULL REFERENCES users(id)
key           UUID NOT NULL
request_hash  TEXT NOT NULL
order_id      UUID NULL REFERENCES orders(id) ON DELETE RESTRICT
created_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now()
UNIQUE (user_id, key)
```

`order_id` is NULL only inside the owning transaction and is never visible as NULL to other transactions. Orders are soft-deleted, so `RESTRICT` can never fire in normal operation. **(Fix 1)**

### Delete semantics (Fix 1)

- `DELETE /api/orders/:id` (admin only) runs `UPDATE orders SET deleted_at = now(), deleted_by = $user WHERE id = $1 AND deleted_at IS NULL`.
- 0 rows affected → `404` (missing or already deleted).
- An idempotent replay of a key whose order was later deleted returns `200` with the original order, including `deletedAt`. The request did create that order, so replaying it must not create a new one.
- The replay response explicitly includes `{ replayed: true, order: { ..., deletedAt } }`. If `deletedAt` is present, the frontend shows "This submission previously created an order that was later deleted" and does not add it to the active table.

## 5. Money contract

- The API accepts and returns integer cents only: `unitPriceCents: number`, `totalAmountCents: number`.
- The client converts user-entered `"12.50"` to `1250` after validating at most two decimals. The server never parses decimals.
- `pg` returns `BIGINT` as a string. Convert it to `number` in one mapper (`Number.isSafeInteger` check). This is safe up to about 9×10¹³ in currency units.
- The server computes `total = Σ quantity × unitPriceCents`. The form shows a read-only derived total. **Documented assumption:** the brief lists "amount" as a form field, but it is derived from the items rather than trusted as input.

## 6. R2 — exactly one order per logical submission

### Client key lifecycle

```text
form opens → key = crypto.randomUUID() (held in useRef)
  → every submit / retry reuses key
  → success or explicit "Start over" → new key
```

- The key is never generated inside `onSubmit`, because a double-click would otherwise produce two keys.
- Submit is disabled while in flight (UX only).
- After an uncertain failure (network error or timeout), the form is locked and offers:
  - **Retry**: same payload, same key.
  - **Start over**: confirmation dialog, then a new key and an editable form.
- `409` → "This submission conflicts with an earlier one", plus a Start-over option.
- `400` (validation) → form stays editable. The key is kept because no order was created and the next payload is a corrected first attempt. The server only stores a hash after validation passes, so this can't cause a 409.

### Server

`Idempotency-Key` header is **required**. Missing or not a UUID → `400`.

```ts
const hash = sha256(canonicalJson({            // normalized fields, fixed order
  customerName, customerEmail,
  items: items.map(i => [i.name, i.quantity, i.unitPriceCents]),
}));

return dataSource.transaction('READ COMMITTED', async (manager) => {
  // EVERY query below uses `manager`. Never an injected repository.  (Fix 3)
  const claimed = await manager.query(
    `INSERT INTO idempotency_keys (id, user_id, key, request_hash)
     VALUES (gen_random_uuid(), $1, $2, $3)
     ON CONFLICT (user_id, key) DO NOTHING
     RETURNING id`, [userId, key, hash]);

  if (claimed.length === 0) {
    const existing = await manager.query(
      `SELECT request_hash, order_id FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
      [userId, key]);
    if (existing[0].request_hash !== hash) throw new ConflictException(...); // 409
    return { replayed: true, order: await loadOrder(manager, existing[0].order_id) }; // 200
  }

  const order = await insertOrderWithItems(manager, dto, userId);   // computes total
  await manager.query(`UPDATE idempotency_keys SET order_id = $1 WHERE id = $2`,
                      [order.id, claimed[0].id]);
  return { replayed: false, order };                                 // 201
});
```

The hash is computed from the same normalized DTO used for insertion: names are trimmed, email is trimmed and lowercased, numeric fields are validated integers, and server-derived fields are excluded. Item order is preserved because it is part of the submitted representation; an identical retry therefore hashes identically.

The controller sets `201` or `200`, plus `Idempotency-Replayed: true` on a replay.

### Why it is correct

- A concurrent `INSERT … ON CONFLICT` on the same `(user_id, key)` **waits** on the uncommitted entry:
  - If the first transaction commits, the waiter gets no row, and its next statement (a fresh `READ COMMITTED` snapshot) sees the committed row, so it replays.
  - If the first transaction rolls back, the waiter claims the key and creates the order.
- No exception is caught inside the transaction, so it is never in the aborted state.
- **Isolation must stay `READ COMMITTED`** (set explicitly). Under `REPEATABLE READ`, a conflict with a row committed after the snapshot raises a serialization error instead of a replay.
- **Pool rule:** a second connection taken mid-transaction plus waiters holding the other pool connections can deadlock the pool. All in-transaction work therefore uses `manager`. The 20-request proof exceeds the pool size and has a 15-second failure timeout; it is a stress/regression check, while scoped-manager use is enforced primarily by the service structure and code review.

### Limits (go in DECISIONS.md)

The key prevents technical duplicates: double-click, network retry, browser resend. It does **not** prevent two agents independently entering the same phone order. A possible follow-up is a non-blocking "similar order in the last 10 minutes" warning (same email and total). It should not auto-reject without a reliable business identifier.

## 7. R1 — list API

```http
GET /api/orders?search=ahmed&status=pending&sort=createdAt&direction=desc&limit=50&cursor=<opaque>
→ { "data": [...], "pageInfo": { "nextCursor": "...|null", "hasNextPage": true } }
```

### Rules

- `limit` defaults to 50, max 100. Fetch `limit + 1` rows to compute `hasNextPage`.
- `sort` ∈ {`createdAt`, `amount`}, `direction` ∈ {`asc`, `desc`}. Both map through an allowlist to fixed SQL fragments.
- Always filter `deleted_at IS NULL` (matches the partial indexes).
- List columns only. No item join.
- `search`:
  - Trimmed and lowercased, max 100 chars.
  - **1–2 chars → `400`**. The client won't send them and shows a hint instead.
  - LIKE metacharacters are **escaped** before binding: `\` → `\\`, `%` → `\%`, `_` → `\_`.

  ```sql
  AND (lower(customer_name)  LIKE '%' || $1 || '%' ESCAPE '\'
    OR lower(customer_email) LIKE '%' || $1 || '%' ESCAPE '\')
  ```

### Cursor (Fix 2 + binding)

- Payload: `{ v: 1, sort, dir, f: <filterFingerprint>, k: [sortValue, id] }`, base64url JSON.
  - `sortValue` is the ISO string with milliseconds for `createdAt` (lossless thanks to `TIMESTAMPTZ(3)`), or the cents as a decimal string for `amount`.
  - `f` = short sha256 of normalized `status|search`.
- On decode: version, shape, and types are strictly validated, and `sort`, `dir`, and `f` must match the current request. Any mismatch → `400 INVALID_CURSOR`. There is no signing: a cursor can only narrow a query the caller is already allowed to run.
- Keyset predicate uses **row-value comparison**, so the composite index is used:

  ```sql
  AND (created_at, id) < ($cursorTs, $cursorId)          -- desc
  ORDER BY created_at DESC, id DESC
  -- asc: (created_at, id) > (...) ORDER BY created_at ASC, id ASC
  ```

- The first release supports forward pagination only. The cursor resets when search, filter, or sort changes. Previous-page navigation and page-number jumps are deliberately omitted to protect the six-hour scope.
- For a stable dataset, adjacent cursor pages have no duplicates or omissions. Concurrent inserts or soft deletes can change which rows fall before or after a cursor; the API deliberately does not hold a database snapshot across a user's page-navigation session.

## 8. Indexes

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- search
CREATE INDEX idx_orders_name_trgm  ON orders USING GIN (lower(customer_name)  gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_email_trgm ON orders USING GIN (lower(customer_email) gin_trgm_ops) WHERE deleted_at IS NULL;

-- sort, no status filter
CREATE INDEX idx_orders_created_id ON orders (created_at DESC, id DESC)         WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_amount_id  ON orders (total_amount_cents DESC, id DESC) WHERE deleted_at IS NULL;

-- sort with status filter
CREATE INDEX idx_orders_status_created_id ON orders (status, created_at DESC, id DESC)         WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_status_amount_id  ON orders (status, total_amount_cents DESC, id DESC) WHERE deleted_at IS NULL;

-- FK lookups
CREATE INDEX idx_order_items_order_id ON order_items (order_id);
```

Verify representative queries with `EXPLAIN (ANALYZE, BUFFERS)`. The README records the query shape, dataset size, chosen scan/index, execution time, and a short interpretation; complete plans may go in `docs/query-plans.md`. If the planner prefers a sequential scan at 50k rows, report that honestly.

## 9. Authentication and authorization

### Passwords

- `crypto.scrypt` (Node built-in, no native dependency) with N=16384, r=8, p=1, a 16-byte random salt, and a 64-byte key.
- Stored as `scrypt$N$r$p$salt$hash`. Compared with `crypto.timingSafeEqual`.
- An unknown email still runs one dummy scrypt, to equalize timing.

### JWT (Fix 4)

- HS256 only. The secret comes from `JWT_SECRET`. Startup fails if it is missing or `Buffer.byteLength(secret, 'utf8') < 32`. `.env.example` contains only a placeholder; the README documents how to generate a development secret.
- Claims: `sub`, `email`, `role`, `iss`, `aud`, `exp`. **Lifetime is 8 h (one agent shift).** That is short enough to bound the damage from a stolen token, and long enough that a reviewer isn't logged out mid-test. There is no refresh token; an expired session means logging in again. The role travels in the token, so a role change takes effect only at the next login. This limitation is documented.
- `jwt.verify` with `algorithms: ['HS256']`, `issuer`, and `audience`.

### Cookie

- Name `access_token`, `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=8h`, `Secure` when `NODE_ENV=production`.
- Read via `cookie-parser`. **No** query-string or header fallback.
- Next.js `rewrites` proxies `/api/*` to NestJS, so the browser sees a single origin.
- Every unsafe request (`POST`, `PUT`, `PATCH`, `DELETE`) passes an Origin guard that requires `Origin` to exactly match the configured frontend origin. Login is covered too. Non-browser proof/test clients send that configured Origin explicitly.

### Endpoints

```text
POST   /api/auth/login     Public   → sets cookie, returns { id, email, role }
POST   /api/auth/logout    Public   → always clears cookie (204), even if absent/expired/invalid
GET    /api/auth/me        Auth     → { id, email, role } from the verified JWT
GET    /api/orders         agent | admin
POST   /api/orders         agent | admin   (Idempotency-Key required)
DELETE /api/orders/:id     admin only      (soft delete; 404 if missing/deleted)
```

- The frontend calls `/api/auth/me` on load to decide between the logged-in view and `/login`, and to show admin-only controls. `/me` and `RolesGuard` use the same verified JWT claims, so the UI and API cannot disagree about the active role. Hiding a control is presentation only; `RolesGuard` is the authorization. A role change takes effect after the next login, as documented.
- Login is rate-limited (`@nestjs/throttler`, 5 attempts per minute per IP, in-memory). Failures are generic: "Invalid email or password". Per-account distributed throttling is documented as production follow-up rather than built for this exercise.
- Error envelope everywhere: `{ code, message, details? }`. Never a stack trace or a DB error.

### Token storage answer (README, 2–3 sentences)

> The JWT lives in an `HttpOnly`, `SameSite=Strict` cookie on a single origin (Next.js proxies `/api`). JavaScript cannot read the token, while SameSite plus server-side Origin validation mitigate CSRF. This does **not** stop XSS from making authenticated requests inside the page, so output escaping and a restrictive CSP remain necessary.

## 10. Security review (README), ordered by impact

**Critical**

1. `jwt.decode()` never verifies the signature. Anyone can craft `{ sub, role: "admin" }` and be accepted.
2. `DELETE /orders/:id` checks only that a token exists. The admin check lives in a React component, so any agent can delete any order by calling the API directly. Combined with #1, anyone can.
3. Login passes raw `req.body` values into the ORM filter. With an ORM that accepts nested filter objects (Prisma-style), `{"email":{"not":""},"password":{"not":""}}` matches the first user, which bypasses authentication through operator injection.
4. Passwords are stored and compared in plaintext.

**High**

5. The signing secret is hard-coded and committed. Since it lives in git history, it must be **rotated**, not just moved to `.env`.
6. `jwt.sign` sets no `expiresIn`, so tokens never expire (and `decode` would ignore `exp` anyway).
7. `req.query.token` puts tokens in URLs, which leak through logs, browser history, and the `Referer` header.

**Design**

8. Delete is a hard delete of financial records, with no audit trail or recovery.
9. Delete returns `{ ok: true }` even when nothing was deleted.
10. Login has no brute-force protection.

The fixes are §9 above plus soft delete (§4).

## 11. Frontend

### Structure

```text
app/login/page.tsx
app/orders/page.tsx
features/auth/use-session.ts            # wraps /api/auth/me, logout
features/orders/api.ts
features/orders/use-orders-query.ts
features/orders/components/{toolbar,table,pagination,create-order-form}.tsx
features/orders/validation.ts
```

### `useOrdersQuery` (single mechanism, no TanStack Query)

On every parameter change:
1. Abort the previous `AbortController`.
2. `const seq = ++seqRef.current`.
3. Fetch with the new signal.
4. Commit the result only if `seq === seqRef.current`.
5. Ignore `AbortError`.
6. Abort on unmount.

The sequence check is the correctness guarantee. Aborting only saves work.

### UI states

- **Loading:** the previous rows stay visible but dimmed, with a spinner. No blank flash.
- **Empty:** "No orders match these filters", plus a clear-filters action.
- **Error:** an inline message with a Retry button.
- **Search hint:** "Type at least 3 characters" when the input has 1–2 characters.

### URL state

- `status`, `sort`, `direction`, and `search` live in the URL.
- Updates use `window.history.replaceState` (integrated with `useSearchParams` in Next ≥14.1), which avoids an RSC round-trip on every keystroke.
- Search is debounced by about 300 ms. Status and sort changes fire immediately, so the rapid-filter race is actually exercised.

### Visible race (for the recording)

```env
SIMULATE_LATENCY_MIN_MS=200
SIMULATE_LATENCY_MAX_MS=1500
```

Applied only to `GET /api/orders`, and only when `NODE_ENV !== 'production'`.

## 12. Validation (client and server independently)

| Field | Rule |
|---|---|
| customerName | trimmed, 2–150 chars |
| customerEmail | trimmed, lowercased, valid email, ≤254 |
| items | 1–5 |
| item.name | trimmed, 1–200 |
| item.quantity | integer 1–1000 |
| item.unitPriceCents | integer 0–100,000,000 (client: ≤2 decimals before conversion) |
| Idempotency-Key | required UUID |
| search | 3–100 chars or absent |
| limit / cursor | bounded / strictly decoded (§7) |
| unknown props | rejected |

## 13. Proofs and tests

1. **Duplicate proof** (`npm run proof:duplicates`, also a Jest e2e test):
   - Log in as the seeded agent and capture the cookie.
   - Send the configured frontend `Origin` header on login and create requests, matching browser behavior enforced by the Origin guard.
   - Build a payload with a **unique email per run** (`proof+<uuid>@example.com`) and one key.
   - Send **20** identical requests with `Promise.all` (more than the pool size of 10, by design).
   - Assert: exactly one `201` and nineteen `200`s with `Idempotency-Replayed: true`, and every response has the same `order.id`.
   - Query the DB: 1 order with that email, the expected item count, and 1 idempotency row for that key.
   - Same key with a different payload → `409`.
   - Fail after 15 seconds with a clear "possible connection-pool deadlock" diagnostic rather than hanging indefinitely.
   - The script prints a pass/fail table for the recording.
2. **Rapid filter** (Vitest + Testing Library, testing the hook): a mocked `fetch` resolves request 1 last, request 2 second, and request 3 first. The final state must equal request 3's data, and no intermediate commit of request 1 or 2 may happen after request 3.
3. **Authorization** (Jest e2e):
   - No cookie → 401.
   - Forged token (signed with a different secret, or `alg: none`) → 401.
   - Agent `DELETE` → 403.
   - Admin `DELETE` → 200, and the order disappears from the list.
   - Tests beyond the required 401/403/admin-success path are added only if time remains.

Further tests only after everything mandatory is done.

## 14. Seed

- Set-based SQL in a single script (`npm run db:seed`), with `SELECT setseed(0.42)` for reproducibility.
- Two users (admin and agent), with passwords hashed through the same scrypt helper. Credentials are listed in the README.
- Orders and items:
  1. Insert 50,000 orders using `generate_series`, with a weighted status distribution, `created_at` spread over the last 365 days, and `total_amount_cents = 0`.
  2. Insert 1–5 items per order with `generate_series` via a lateral join.
  3. Run `UPDATE orders SET total_amount_cents = sums.total FROM (SELECT order_id, SUM(quantity*unit_price_cents) …)` so totals always equal the item sums.
- Print the elapsed time. The seed refuses to run on a non-empty `orders` table unless `--reset` is passed.

## 15. Documentation

### DECISIONS.md

**Write the entries during implementation**, while the alternatives are still fresh, rather than at the end. Each entry covers the decision, a serious alternative, the alternative's benefit, why it was rejected, and the consequences and limits.

1. Database-backed idempotency with `ON CONFLICT DO NOTHING`. Alternatives: catch-the-unique-violation, or a natural-key dedup.
2. Keyset pagination vs offset. Cost: no page numbers or exact totals.
3. Server-authoritative totals in integer cents vs trusting the submitted amount.

It also includes an AI-use disclosure: what AI drafted, and what was verified by hand (EXPLAIN plans, the proof run, the race test).

### README product answer

Ask why cancelled orders must go, what retention or audit rules apply, whether cancellation is reversible, and who authorizes it. If she can't answer, propose a "hide cancelled" filter or archive with retention rules, a preview count, an audit trail, and restore, instead of irreversible bulk deletion. This matches the soft-delete model the code already uses.

### SCALE.md (5M orders, 3 devs, 2 countries)

- **Keep:** the modular monolith, PostgreSQL as the source of truth, DB-backed idempotency, keyset pagination, integer cents, server-side authorization, and soft delete.
- **Change:**
  - A TTL plus a purge job for `idempotency_keys`.
  - Measure GIN write amplification before adding more search indexes.
  - No exact `COUNT(*)`; use estimates or omit totals.
  - Define "revenue today" in a named business timezone, store UTC, and render each agent's timezone.
  - Measure latency from both countries before adding a read replica, and keep one write region.
  - Archive or partition by `created_at` driven by retention rules.
  - Revisit role-in-token versus a session lookup if role changes must take effect immediately.
  - Add pooling, query monitoring, structured logs, traces, and backups.
- **Refuse:**
  - Active-active writes.
  - Microservices for three developers.
  - Event sourcing.
  - Exact live counts.
  - Jumps to page 4,000.
  - Bulk hard delete.
  - New GIN indexes without measuring their write cost.

## 16. Optional

O1 (slow stats) only if everything above is complete. O2 is skipped: optimistic rows plus idempotent reconciliation is too risky in the time budget.

## 17. Schedule (6 h, hard stop)

| Time | Work |
|---|---|
| 0:00–0:25 | Scaffold Next + Nest + PG, env validation, rewrites proxy |
| 0:25–0:55 | Migrations (incl. `TIMESTAMPTZ(3)`, soft delete, partial indexes), set-based seed |
| 0:55–1:35 | scrypt, cookie JWT, `/login` `/logout` `/me`, auth/roles/Origin guards, simple IP throttling |
| 1:35–2:20 | Idempotent create (manager-only, READ COMMITTED), soft delete |
| 2:20–3:05 | Keyset list query, escaping, cursor binding |
| 3:05–3:55 | Orders UI, URL state, seq + abort, UI states, simulated latency |
| 3:55–4:35 | Create form, key lifecycle, Retry / Start over |
| 4:35–5:05 | Duplicate proof, rapid-filter test, focused 401/403/admin-success tests |
| 5:05–5:40 | Finish README, DECISIONS (already drafted), SCALE |
| 5:40–6:00 | Recording, clean-clone run of README, final gap list |

**Already removed to protect the deadline:** Previous-page navigation, custom IP+email throttling, and broad auth-test coverage. **Cut first if still late:** dummy-hash timing equalization, then tests beyond 401/403/admin success. Never cut the duplicate proof, rapid-filter behaviour, server authorization, mandatory documents, recording, or gap list.

## 18. Definition of done

- A clean clone runs from the README in under 5 minutes, with 50k+ orders seeded.
- The browser only ever receives one page. Search, status filter, and both sorts work. For a stable dataset, adjacent cursor pages contain no skipped or repeated rows; concurrent writes do not claim snapshot semantics.
- Rapid filter changes never render stale data, and the latency toggle makes this visible.
- 20 concurrent identical creates produce 1 order (1×201, 19×200). A different payload with the same key returns 409. There is no pool hang.
- JWTs are verified. Admin-only routes are enforced server-side. Unsafe methods validate Origin. `/me` and public idempotent `/logout` work. A refresh keeps the session, and the UI and API use the same JWT role.
- Deleting an API-created order works (soft delete), and replaying its key still returns it.
- The README has the prioritized security review, the token-storage answer, the product answer, EXPLAIN output, and "What I skipped and why".
- DECISIONS.md states the idempotency limits and the AI use. SCALE.md is tied to this schema.
- The recording or screenshots cover R1 (rapid filter) and R2 (proof output).
