# AUDIT-04 — Audit read API (admin-only) — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → AUDIT-04 (ACTION-PLAN 2.3)
- Status: done
- Commit: `AUDIT-04: admin-only audit read API`

## What shipped

- Permission **`audit.read`** in the catalog, granted to **System Admin +
  Company Admin only** (`ADMIN_STAFF` superset) — no other staff or client
  role holds it (permission matrix, architecture.md:114).
- **`GET /audit`** (`AuditController`, `@RequirePermission('audit.read')`) with
  filters `resource, action, actorId, clientId, from, to` and newest-first
  cursor pagination (`limit` ≤ 200, `beforeId`). Reads via the staff path
  (`app_staff` SELECT + permissive RLS → all clients; audit is cross-client
  for admins).
- Zod contract in `@hr/contracts` (`auditQuerySchema`, `auditEntrySchema`,
  `auditListResponseSchema`) — shared with the AUDIT-05 web UI (ADR-007).
- `GET /audit` registered as **`staff`** in the isolation harness.
- Reusable test helper `loginAsEnrolledStaff()` — logs in an admin and
  completes MFA enrollment to reach a FULL session.

## DoD check

| DoD item | Result |
|---|---|
| `audit.read` gated to System/Company Admin only | ✅ both admins → 200; hr_officer → 403; client rep → 403; unauth → 401 |
| Read/filter API works | ✅ filter by action and by client return only matching rows |
| Cursor pagination newest-first | ✅ `limit=2` + `beforeId` pages without overlap; `nextCursor` null on last page |
| BigInt id survives JSON | ✅ `id` serialized as a decimal string (no 500) |
| Catalog coverage green (audit.read declared) | ✅ CATALOG COVERAGE test passes |
| Isolation harness green incl. `GET /audit` | ✅ registered `staff`; unauth → 401 |
| `lint typecheck test build` green | ✅ turbo 15/15; **71/71 tests** (16 files, +8) |

## Test output (`test/audit/audit-read.e2e-spec.ts`, 8/8)

```
✓ System Admin → 200 with entries
✓ Company Admin → 200
✓ non-admin staff (hr_officer) → 403 (lacks audit.read)
✓ client rep → 403
✓ unauthenticated → 401
✓ BigInt id is serialized as a string (no crash)
✓ filters by action and by client
✓ paginates newest-first via limit + beforeId cursor
```

Full pipeline: `pnpm turbo run lint typecheck test build` → **15/15**,
**71/71 tests**.

## Design decisions recorded

- **audit.read is admin-only, so both holders are MFA-required.** The 200-path
  tests therefore use `loginAsEnrolledStaff()` (login → MFA enroll → verify →
  full session), added to the shared login helpers for reuse.
- **BigInt id → string in the contract.** `aud_entries.id` is BIGSERIAL; JSON
  has no BigInt, so `auditEntrySchema.id` is a string and the query service
  maps `id.toString()`. The `beforeId` cursor is likewise a numeric string, so
  paging never loses precision.
- **Cross-client by design.** Admins see every client's audit trail; the read
  runs on the staff path under the permissive RLS staff policy. The `clientId`
  filter is a convenience, not an isolation boundary (isolation for audit is
  "only admins can read at all").
- **No write path added** — `GET /audit` is non-mutating, so the write-audit
  coverage registry is unaffected.

## Deferred (stated)

- The admin read **UI** (Next.js, ar/en + RTL) over this API is **AUDIT-05**.
- `before/after` field redaction for sensitive columns remains a follow-on for
  the first module that writes them.
