# Spec 08 — Documentation and Submission

## Objective

Make the solution reproducible, reviewable, honest about limitations, and ready for the live interview.

## Dependencies

- Specs 01–07 accepted or gaps explicitly recorded.

## README acceptance criteria

- Prerequisites plus environment, migration, seed, dev, test, and proof commands.
- Seeded development credentials.
- Architecture and endpoint summary.
- Index/query evidence: dataset size, query shape, plan, timing, interpretation.
- Prioritized supplied-code security review and applied fixes.
- Two-to-three-sentence token-storage answer.
- Product answer about deleting cancelled orders in at most five lines.
- Development-latency instructions.
- “What I skipped and why,” including impact.

## DECISIONS acceptance criteria

Three decisions, five to eight lines each:

1. `ON CONFLICT DO NOTHING` idempotency.
2. Keyset instead of offset pagination.
3. Server-authoritative integer-cent totals.

Each includes a serious alternative, its benefit, rejection reason, consequences, and limits. AI assistance and manual verification are disclosed.

## SCALE acceptance criteria

One page grounded in this implementation:

- What remains in the modular monolith at five million orders.
- Idempotency-key TTL/purge.
- GIN write cost and exact-count tradeoffs.
- Two-country timezone and “revenue today” semantics.
- Single-write-region latency and measured trigger for replicas.
- Retention-driven archival/partitioning.
- Refusal of premature microservices/event sourcing, active-active writes, exact live counts, page-4000 jumps, and bulk hard deletion.

## Visual evidence acceptance criteria

- Two-minute recording or three screenshots.
- R1 shows rapid changes with simulated latency and correct final state.
- R2 shows the 20-request result and database cardinality assertions.
- No secret, token, or personal information appears.

## Final review checklist

- [ ] Follow README from a clean checkout.
- [ ] Start in under five minutes, excluding dependency download.
- [ ] Seed 50,000+ orders.
- [ ] Run mandatory tests and duplicate proof.
- [ ] Perform manual R1 race check.
- [ ] Inspect browser payload sizes.
- [ ] Check all documents against the PDF.
- [ ] Confirm `.env` and generated artifacts are untracked.
- [ ] Confirm commit history follows specs and contains no secret.
- [ ] Capture evidence and list known gaps.

## Submission gate

Submit only when mandatory criteria pass or every failure is disclosed. Do not add O1/O2 before clean-clone review passes.

## Commit

```text
docs: record decisions scale review and submission evidence
```
