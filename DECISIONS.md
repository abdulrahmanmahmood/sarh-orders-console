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

AI assisted with plan critique, specification structure, implementation drafts, and review checklists. I verified the implementation through TypeScript checks, production builds, clean dependency audits, real PostgreSQL migrations and query plans, manual authentication/authorization calls, the deterministic stale-response test, and the 20-request concurrency proof. Any remaining omissions are stated in README rather than represented as complete.

