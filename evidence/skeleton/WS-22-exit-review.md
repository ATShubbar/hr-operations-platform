# WS-22 — Walking skeleton exit review

- Date: 2026-07-20 (review executed while WS-20/21 remain external-blocked)
- Reviewer: agent + owner (approval-gated per BACKLOG working rules)
- Verdict: **Skeleton phase CLOSED with two recorded gaps** (cloud deploy + backup drill), both blocked on AWS new-account verification, both fully prepared and tracked in `docs/HANDOFF-WS20.md`. Priority-2 module development is unblocked and deploy-target-agnostic.

## Verification performed at review time (fresh, not from memory)

```
pnpm turbo run lint typecheck test build  →  Tasks: 15 successful, 15 total
  (includes 24 API e2e tests: RLS scenarios, isolation harness, authz guard,
   logging trace, health; contracts + dates unit tests)
Live API slice:  /health 200 (todayHijri: Safar 5, 1448 AH) ·
  guarded bilingual /example/greeting served · request-id trace: 2 log lines
Live web slice (production image):  /ar 200 with dir="rtl" · /en 200
Local stack: postgres + redis healthy (23h uptime)
```

## DoD walkthrough (ACTION-PLAN 1.1–1.7 → evidence)

| DoD | Status | Evidence |
|---|---|---|
| 1.1 Monorepo | ✅ | WS-01..04 |
| 1.2 CI/CD | ✅ CI (green main, red proof PR, DB-capable) · ⚠️ **deploy half open** — pipeline authored+gated, images smoke-tested; cloud run blocked externally | WS-09, WS-18; gap: HANDOFF-WS20 |
| 1.3 API skeleton (deny-by-default, tracing, health) | ✅ | WS-14, WS-15 |
| 1.4 Web skeleton (ar/en RTL, Hijri, shadcn checklist) | ✅ | WS-16, WS-17 |
| 1.5 DB plumbing (RLS pattern, migrations by CI) | ✅ | WS-11, WS-12, WS-13 |
| 1.6 Isolation harness (coverage-enforced, CI) | ✅ | WS-18 |
| 1.7 Backups + restore test | ⚠️ **open** — 7-day retention configured in the pending RDS create; drill blocked externally | gap: HANDOFF-WS20 step 10 |

Evidence folder complete: WS-01..WS-19 one file per task, each with DoD table + captured outputs.

## Recorded gaps (open items carried forward)

1. **WS-20 (deploy):** AWS UAE staging half-provisioned; RDS + ECS creation blocked by new-account restrictions (~2 days at review time); support case active. Pickup: `docs/HANDOFF-WS20.md` — exact commands, ~1h of work once unblocked, only owner action is the `DEPLOY_ENABLED` flip.
2. **WS-21 (backup/restore drill + measured RPO/RTO):** entirely behind WS-20.
3. Standing constraints re-affirmed: interim environment is **staging only, no real client data ever** (ADR-006 rev. 4); KSA cutover before first real client; root email rotation pending company address.

## Architecture conformance spot-checks

- Frozen architecture v1.4 untouched since freeze; all deviations went through ADR revisions (ADR-006 revs 1–4 document the provider saga honestly).
- ADR statuses: 001–008 Accepted (001 via executed spike), 009 Accepted; index current.
- Module boundaries, RTL rule, deny-by-default, and endpoint registry all mechanically enforced in CI — verified red-path proofs exist (WS-08, WS-09, WS-18).

## Decision

The walking skeleton delivered its purpose: every architectural mechanism exists, is enforced, and is proven by evidence. The two open items are operational, externally blocked, fully documented, and do not gate module development. **Priority 2 opens with the Authentication epic.**
