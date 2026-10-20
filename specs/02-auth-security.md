# Spec 02 — Authentication and Authorization

## Objective

Replace the supplied insecure authentication with verified cookie JWTs, server roles, safe passwords, and Origin protection.

## Dependencies

- Spec 01 schema and seeded users accepted.

## Scope

- Scrypt password hashing and timing-safe comparison.
- Public login/logout and authenticated `/auth/me`.
- Global JWT guard and roles guard.
- HttpOnly SameSite cookie through the Next.js `/api` proxy.
- Exact Origin validation for unsafe methods.
- Per-IP login throttling.
- Admin-only soft-delete endpoint.

## Acceptance criteria

- Valid credentials set an `HttpOnly`, `SameSite=Strict` cookie and return user summary.
- Wrong credentials return one generic `401` message.
- Non-string login input is rejected before an ORM query.
- JWT verification pins HS256, issuer, audience, and eight-hour expiration.
- `JWT_SECRET` is required and at least 32 bytes; only a placeholder is committed.
- `/auth/me` and `RolesGuard` use the same verified JWT role.
- Logout always clears the cookie and returns `204`, even for absent/invalid tokens.
- Missing, invalid, or expired authentication returns `401` on order routes.
- Agent delete returns `403`; admin delete succeeds server-side.
- Invalid or missing Origin on unsafe methods returns `403`.
- Delete sets `deleted_at`/`deleted_by`; repeating it returns `404`.
- Refreshing during a valid session preserves login.

## Verification

- No cookie, forged signature, and `alg:none` return `401`.
- Agent delete returns `403`; admin delete succeeds.
- Incorrect Origin returns `403`.
- Manual refresh restores session and logout clears it.

## Review checklist

- [ ] No `jwt.decode()` authentication.
- [ ] No plaintext password query/storage.
- [ ] No raw body object reaches an ORM filter.
- [ ] No query-string/header token fallback.
- [ ] UI visibility is not authorization.
- [ ] Error responses expose no internals.
- [ ] The committed sample secret is treated as compromised and rotated.

## Risks and limits

Role changes take effect at next login. SameSite and Origin checks do not stop XSS acting as the user. In-memory throttling is not a distributed production control.

## Commit

```text
feat(auth): implement secure cookie authentication and roles
```
