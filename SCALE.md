# Scaling the Orders Console to Five Million Orders

With three developers I would keep the modular monolith, PostgreSQL source of truth, Nest guards/services, integer-cent money, server-authoritative totals, database idempotency, and keyset API. Splitting services would multiply deployment, tracing, transaction, and ownership costs before the team has evidence that a module boundary needs an independent lifecycle.

The first change is measurement and lifecycle management. The current trigram GIN indexes make substring search fast but increase write amplification; I would track index size, write latency, hit rate, and real query plans before adding any more. Exact `COUNT(*)` would not run on every filter: the UI can omit totals or use delayed estimates. Orders would be archived or partitioned by `created_at` only after retention rules and plan measurements justify it, not merely because the row count sounds large.

`idempotency_keys` cannot grow forever. A scheduled purge would remove keys beyond the documented retry window—perhaps 24–72 hours—while preserving orders. The operation would be batched and monitored. If external clients need longer replay guarantees, the retention window becomes an API contract and capacity input rather than an arbitrary cleanup value.

Two countries make time and latency product questions. PostgreSQL stores UTC; each agent sees dates in a configured timezone. “Revenue today” must name a business timezone or return per-market values, since server-local midnight is wrong. I would begin with one authoritative write region because order creation and unique idempotency are simple and correct there, measure both countries’ p95 latency, and add a read replica only if list latency—not assumptions—justifies replication complexity and tolerable lag.

Operationally I would add connection pooling, structured logs containing request/idempotency correlation IDs without tokens, slow-query monitoring, traces across the Next proxy and API, backup restoration drills, and explicit recovery objectives. A summary table or asynchronously refreshed view could serve slow statistics; it must state freshness.

I would refuse active-active writes until the business funds conflict semantics for idempotency and orders. I would also refuse premature microservices/event sourcing, exact live counts for every filter, arbitrary jumps to page 4,000, unmeasured extra GIN indexes, and bulk hard deletion of financial records. A request for any of these needs a measured user problem, ownership plan, failure model, and migration/rollback path first.

