# Orders Console — Specification Index

The work is split into small, reviewable specifications aligned with the intended Git history. Execute them in order; do not start optional work while a mandatory spec is incomplete.

| Order | Specification | Primary commit |
|---:|---|---|
| 0 | [Mission and delivery contract](./specs/00-mission.md) | `docs: define implementation specifications and acceptance gates` |
| 1 | [Foundation, schema, indexes, and seed](./specs/01-foundation-data.md) | `feat(db): add order schema indexes and deterministic seed` |
| 2 | [Authentication and authorization](./specs/02-auth-security.md) | `feat(auth): implement secure cookie authentication and roles` |
| 3 | [Idempotent order creation](./specs/03-idempotent-create.md) | `feat(api): guarantee idempotent order creation` |
| 4 | [Orders list API](./specs/04-orders-list-api.md) | `feat(api): add cursor-paginated order queries` |
| 5 | [Orders list interface](./specs/05-orders-list-ui.md) | `feat(web): add searchable orders console` |
| 6 | [Create-order interface](./specs/06-create-order-ui.md) | `feat(web): add idempotent create-order form` |
| 7 | [Correctness proofs](./specs/07-verification.md) | `test: prove concurrency race and authorization guarantees` |
| 8 | [Documentation and submission](./specs/08-submission.md) | `docs: record decisions scale review and submission evidence` |

The complete technical design remains in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md). If a spec conflicts with the assignment, the assignment wins. If implementation changes a decision, update the affected spec and `DECISIONS.md` in the same commit.

## Execution tracker

| Spec | Budget | Status | Acceptance evidence |
|---|---:|---|---|
| 00 Mission | 15 min | Accepted | Specification baseline committed as `11dfa41` |
| 01 Foundation/data | 35 min | Accepted | Build/typecheck; 50,000 orders, 150,365 items, zero invalid totals |
| 02 Auth/security | 45 min | Accepted | Manual 400/401/403, Origin, role delete, `/me`, and logout checks |
| 03 Idempotent API | 45 min | Accepted | 201 create, normalized 200 replay, 409 conflict; transaction-scoped manager |
| 04 List API | 45 min | Accepted | Bounded cursor pages, filters/search/sorts; measured index plans (0.36/0.17/38 ms) |
| 05 List UI | 45 min | Accepted | Abort + sequence guard, bounded table, URL filters, visible latency support |
| 06 Create UI | 40 min | Accepted | Exact cents, stable logical key, retry lock, conflict and deleted-replay handling |
| 07 Verification | 30 min | Not started | Mandatory proof output |
| 08 Submission | 40 min | Not started | Clean-clone review and evidence |

Total planned work is 5 h 40 min, leaving 20 minutes before the six-hour hard stop. Update Status to `In progress`, `Accepted`, or `Accepted with documented gaps` as work proceeds.

## Workflow for every specification

1. Confirm dependencies are accepted.
2. Implement only the stated scope.
3. Run its automated checks.
4. Perform its review checklist.
5. Record evidence or limitations.
6. Commit only when its acceptance gate passes.

An acceptance failure blocks dependent specs. At the six-hour hard stop, preserve a runnable state and list incomplete criteria in README rather than weakening or hiding them.

## Commit rules

- Keep the history because reviewers inspect it; do not collapse everything into one final commit.
- A commit must leave the repository runnable and must not knowingly break already accepted specs.
- Include feature-specific tests with the feature commit; Spec 07 adds cross-cutting proofs.
- Never commit `.env`, generated secrets, dependency folders, build output, or recordings containing tokens.
- If acceptance forces a design change, update its spec in the same commit so documentation does not drift.
- Use the commit subject listed by the spec; add a short body for important tradeoffs when useful.

## Assignment traceability

| Assignment area | Owning specs | Final evidence |
|---|---|---|
| 50,000-order real database | 01 | Seed counts and timing |
| Search/filter/sort/pagination | 01, 04, 05 | Query plans, network inspection, UI recording |
| Rapid-filter correctness | 05, 07 | Deterministic test and latency recording |
| Validated create form | 03, 06 | API and component checks |
| No duplicate retries | 03, 07 | 20-request proof and DB cardinality |
| Authentication code review/fix | 02, 08 | E2E checks and README findings |
| Product question | 08 | README |
| Three engineering decisions | 08 | `DECISIONS.md` |
| Senior five-million-order memo | 08 | `SCALE.md` |
| Submission evidence | 07, 08 | Recording/screenshots |
