# Spec 00 — Mission and Delivery Contract

## Mission

Give operations agents a fast, reliable way to find and manually register orders while ensuring that double-clicks, retries, and browser resubmissions never create duplicate orders.

The submission demonstrates senior judgment: correctness lives at server/database boundaries, performance is measured, authorization is enforced server-side, and limitations are explicit.

## Global outcomes

- Search, filter, and sort at least 50,000 orders without sending the full table to the browser.
- Older responses never replace the latest filtered result.
- Twenty concurrent copies of one logical create request persist exactly one order.
- Forged, expired, unauthenticated, or underprivileged sessions cannot cross protected boundaries.
- A reviewer can start, seed, test, and use the system from README in under five minutes.
- README, `DECISIONS.md`, `SCALE.md`, and visual evidence satisfy the assignment.

## Actors

- **Agent:** logs in, searches orders, and creates orders.
- **Administrator:** has agent capabilities and can soft-delete orders.
- **Reviewer:** performs clean setup, race checks, proofs, and design review.

## Non-goals

Registration, password reset, refresh tokens, exact result counts, arbitrary page jumps, previous-page navigation, bulk hard deletion, cross-agent business deduplication, microservices, event sourcing, Elasticsearch, and optional work before mandatory completion.

## Global definition of done

- Every mandatory criterion in Specs 01–08 passes or is explicitly recorded as incomplete with impact and reason.
- R1 and R2 evidence is captured.
- No optional feature compensates for failed mandatory behavior.
- Clean-clone review succeeds using only README.

## Global review questions

- Does every guarantee identify its real enforcement boundary?
- Can a reviewer reproduce every important claim?
- Did each added complexity solve a requirement?
- Are security statements precise rather than absolute?
- Are known limits and skipped work visible?

## Commit

```text
docs: define implementation specifications and acceptance gates
```
