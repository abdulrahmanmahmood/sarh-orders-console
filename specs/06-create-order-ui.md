# Spec 06 — Create-Order Interface

## Objective

Let an agent enter a valid order while preserving one idempotency identity across double-clicks and uncertain retries.

## Dependencies

- Specs 02, 03, and 05 accepted.

## Scope

- Customer and one-to-five-item form.
- Independent client validation.
- Exact decimal-to-cents conversion and derived total.
- Idempotency key lifecycle outside `onSubmit`.
- Success, validation, conflict, uncertain failure, Retry, and Start-over behavior.

## Acceptance criteria

- Customer name is 2–150 trimmed characters; email is valid and normalized.
- One to five items respect name, quantity, and price bounds.
- Price accepts at most two decimals and converts exactly to cents without floating-point totals.
- Total is read-only and derived from items.
- One UUID is created when a logical form session begins, not per submit.
- Double-clicks cannot create two logical keys; submit is disabled while active.
- Validation errors keep the form editable and retain the key.
- Uncertain failure locks editing and offers Retry with identical key/payload or confirmed Start over with a new key.
- `409` explains the key/payload conflict and offers Start over.
- Success resets the form and generates the next key.
- Deleted-order replay displays a message and is not inserted into the active list.

## Verification

- Component tests for key stability on retry and regeneration after success/reset.
- Exact conversion tests for `0.10`, `12.50`, and maximum price.
- Manual double-click and uncertain-error flows.
- Confirm the API ignores any client attempt to authoritatively set total.

## Review checklist

- [ ] Key generation is outside `onSubmit`.
- [ ] Retry uses an immutable normalized-payload snapshot.
- [ ] Editing cannot silently continue after an uncertain result.
- [ ] UI disabling is described as UX, not uniqueness enforcement.
- [ ] Client and server validation remain independent.

## Commit

```text
feat(web): add idempotent create-order form
```
