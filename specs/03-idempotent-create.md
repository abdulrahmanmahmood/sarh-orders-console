# Spec 03 — Idempotent Order Creation API

## Objective

Guarantee that technical retries of one logical submission create exactly one order under concurrency.

## Dependencies

- Specs 01 and 02 accepted.

## Scope

- Validated create DTO and mandatory `Idempotency-Key` UUID.
- Normalization and canonical request hashing.
- `READ COMMITTED` transaction using only its scoped manager.
- Atomic claim with `ON CONFLICT DO NOTHING RETURNING`.
- Order/item insert and server-authoritative total.
- Identical replay, conflict, rollback, and deleted-order replay.

## Acceptance criteria

- Missing/invalid key returns `400` before writes.
- Invalid DTO stores no idempotency row.
- Names are trimmed, email lowercased, integer fields validated, item order preserved, and derived fields excluded before hashing.
- First execution atomically creates one order and its items and returns `201`.
- Identical replay returns `200`, the same order ID, and `Idempotency-Replayed: true`.
- Same key with another normalized payload returns `409`.
- Rollback leaves no order, item, or committed claim; retry can succeed.
- Every transaction query uses the supplied entity manager.
- Replay after soft deletion returns the original order with `deletedAt` and creates nothing.

## Concurrency review

- [ ] No query follows a unique violation inside an aborted transaction.
- [ ] Competing inserts wait for the owning transaction.
- [ ] Owner commit causes replay; rollback permits the waiter to claim.
- [ ] No injected repository takes another connection in the transaction.
- [ ] Response status selection does not weaken atomicity.

## Verification

- Test first create, identical replay, and different-payload `409`.
- Induce item-insert failure and verify full rollback.
- Test replay after soft deletion.
- Complete high-concurrency proof in Spec 07.

## Limit

This prevents retry duplicates for one key, not two agents independently entering the same phone order. Record this in `DECISIONS.md`.

## Commit

```text
feat(api): guarantee idempotent order creation
```
