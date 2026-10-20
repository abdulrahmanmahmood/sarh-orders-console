# Spec 04 — Orders List API

## Objective

Serve fast, deterministic pages with search, filtering, and sorting without returning the full dataset.

## Dependencies

- Spec 01 data/indexes and Spec 02 authentication accepted.

## Scope

- Protected `GET /api/orders`.
- Customer name/email search and status filter.
- Creation-date/amount sorting in both directions.
- Forward-only cursor pagination bound to query context.
- Query-plan measurement.

## Acceptance criteria

- Default limit is 50, maximum 100, and SQL fetches only `limit + 1` rows.
- Response contains data, `nextCursor`, and `hasNextPage`.
- Soft-deleted orders and item collections are absent.
- Search is trimmed/lowercased, limited to 100 characters, and requires three characters.
- `%`, `_`, and `\` are escaped as literals.
- Sort/direction use allowlists; input is never interpolated.
- Ordering uses sort value plus `id` as tie-breaker.
- Cursor contains version, sort, direction, filter fingerprint, and typed key values.
- Malformed/context-mismatched cursors return `400 INVALID_CURSOR`.
- For a stable dataset, adjacent pages have no repeats or omissions.
- No multi-request snapshot guarantee is claimed during concurrent writes.

## Verification

- Exercise each status and every supported sort/direction.
- Traverse stable pages and verify unique IDs and ordering.
- Verify invalid and mismatched cursors.
- Run representative `EXPLAIN (ANALYZE, BUFFERS)` for all-status, status-filtered, and search queries.
- Record dataset size, plan/scan, execution time, and interpretation.

## Review checklist

- [ ] Query selects list columns only.
- [ ] Timestamp and amount cursor values round-trip exactly.
- [ ] Row-value predicate matches composite ordering.
- [ ] Ascending/descending comparisons are correct.
- [ ] Search expression matches trigram indexes.

## Limits

No exact count, page-number jump, or previous navigation. Report honestly if PostgreSQL selects a sequential scan.

## Commit

```text
feat(api): add cursor-paginated order queries
```
