# Engineering Decisions

## 1. Database-backed idempotency

I claim `(user_id, idempotency_key)` with `INSERT … ON CONFLICT DO NOTHING RETURNING` inside the order transaction.  
I considered catching a unique-constraint exception and then reading the existing row.  
That looks simpler, but PostgreSQL aborts the transaction after the violation, so the follow-up query cannot run there.  
At `READ COMMITTED`, a competing insert waits; commit produces a replay, while rollback lets the waiter claim the key.  
The request hash rejects reuse with different normalized data, and all transaction work uses its scoped manager.  
This prevents technical retries, not two agents independently entering the same real-world order.

## 2. Keyset rather than offset pagination

The API orders by `(created_at, id)` or `(total_amount_cents, id)` and returns an opaque forward cursor.  
I considered `LIMIT/OFFSET`, which gives simple page numbers and previous-page navigation.  
Large offsets become progressively expensive and concurrent inserts make page boundaries unstable.  
Keyset predicates align with composite indexes and remain bounded as the table grows.  
The cursor is bound to filters and sorting, preventing accidental reuse in another query.  
The cost is deliberate: no arbitrary page 4,000 jump, previous button, exact total, or cross-request snapshot claim.

## 3. Server-authoritative totals in integer cents

The UI accepts decimal-looking prices but converts them to integer cents; the server recomputes the order total from items.  
I considered accepting the form’s total as authoritative because the brief names “amount” as a field.  
That would simplify creation but permits tampering and creates disagreement between items and the financial total.  
Integer arithmetic avoids binary floating-point rounding and fits the bounded assessment domain safely.  
PostgreSQL checks non-negative values, while the seed verifies every stored total against item sums.  
The assumption is that amount is displayed in the form but derived, rather than freely editable.

## AI use

**What I decided and did:**
- I chose the stack and the architecture.
- I chose how the main problems are solved: database-backed idempotency, keyset pagination, cookie authentication, and server-authoritative totals.
- I chose the execution approach: a written plan, then numbered specs, then one commit per spec.
- I set up the AI tools with MCP servers and skills, and reviewed every step before moving on.
- I wrote a large part of the code myself, including the fixes where the AI hallucinated or got stuck on a bug.

**What the AI did:**
- I used Codex to turn my decisions into a detailed plan and specs, and to implement parts of the code alongside me.
- I used Claude to review the plans and the code and to propose fixes. I decided which proposals to accept.

**What review caught:** the reviews changed real behaviour, not style.
- Catching a unique violation would abort the PostgreSQL transaction, so I switched to `ON CONFLICT DO NOTHING`.
- Microsecond timestamps would skip or repeat rows across cursor pages, so the column became `TIMESTAMPTZ(3)`.
- Behind the Next.js proxy, one rate-limit bucket was shared by every user. Throttling is now per account and per IP.
- The seed tied each customer name to only two statuses, so searching a name and filtering by status returned nothing.
- A forged cursor returned 500 instead of 400.

**How it is verified:**
- Two runnable proofs against real PostgreSQL over HTTP: `proof:duplicates` (20 concurrent creates make one order) and `proof:auth` (14 authentication and authorization checks, including a control token).
- A Vitest test for out-of-order list responses.
- Browser checks of the rapid-filter, double-click, and retry flows.
- `EXPLAIN` query plans.
- A clean-clone run of the README.

Remaining gaps are listed in the README rather than presented as complete.

