# OCI-06 — AWS UAE staging teardown — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → OCI-06 (OCI epic; ADR-006 rev. 5)
- Status: done
- Owner approval: explicit ("yeah let's tear it down") after the cost was surfaced

## Why

ADR-006 rev. 5 moved the target to OCI Riyadh. The AWS UAE interim environment
(account `075483720704`, `me-central-1`) was left running and metering — the ALB
alone at roughly $22/mo for an environment that was abandoned.

## Inventory taken BEFORE deleting anything (read-only)

**Nothing in the environment held data**, which is itself the finding: it never
got past the new-account restriction.

| Resource | State found |
|---|---|
| ALB `hr-staging-alb` | still `provisioning` **6 days after creation** — never went active |
| Listener :80, `hr-api-tg`, `hr-web-tg` | no targets ever registered |
| ECS clusters | **none** (CreateCluster was throttled) |
| RDS instances | **none** (CreateDBInstance → `InvalidAction`) |
| ECR `hr-api`, `hr-web` | **0 images** (pushes were KMS-denied) |
| S3 `hr-platform-staging-075483720704` | **0 objects, 0 versions** |
| SSM `/hr/staging/db/master-password` | SecureString for a database that never existed |
| Log groups `/hr/api`, `/hr/web` | **0 stored bytes** |
| SGs `hr-alb-sg`, `hr-app-sg`, `hr-db-sg` | scaffolding |
| IAM `hr-platform-deploy`, `hr-task-execution`, `hr-task-role`, GitHub OIDC provider | scaffolding |

No backup was needed or taken: there was nothing to back up. The standing guard
("no real client data ever in this environment") held throughout its life.

## Deleted, in dependency order

1. **ALB** `hr-staging-alb` → waited for `load-balancers-deleted` ✅ *(the meter)*
2. Target groups `hr-api-tg`, `hr-web-tg` ✅
3. ECR repositories `hr-api`, `hr-web` ✅
4. S3 bucket `hr-platform-staging-075483720704` ✅ (verified empty first)
5. SSM parameter `/hr/staging/db/master-password` ✅
6. Security groups — `hr-db-sg` → `hr-app-sg` → `hr-alb-sg` (each references the
   next, so deletion had to follow that order) ✅
7. IAM: inline/managed policies detached, then roles `hr-platform-deploy`,
   `hr-task-execution`, `hr-task-role` ✅
8. GitHub Actions **OIDC provider** ✅

## Verification after teardown

```
ALBs:      0
TargetGrp: 0
ECR repos: 0
S3:        0
SSM /hr:   0
hr SGs:    0
hr roles:  0
OIDC:      0
LogGroups: 2   (0 stored bytes — see below)
Budget:    My Monthly Cost Budget   (kept deliberately)
```

## Two deliberate exceptions

- **The two log groups could not be deleted.** `DeleteLogGroup` returns
  `ServiceUnavailableException` on retry — the same account-restriction family
  that blocked ECS, RDS and ECR pushes all along. Both hold **0 stored bytes**, and
  CloudWatch charges for ingestion/storage, not for an empty group, so they cost
  nothing. Left in place rather than pretended away.
- **The budget alert was kept.** A dormant account with a live cost alarm is the
  right end state — it is the tripwire if anything is ever created here again.

The account itself remains open and dormant at zero cost (closing an account is
not an action I can take, and ADR-006 keeps it in case `me-central-2` ever opens
to standard accounts).

## Code change

`.github/workflows/ci.yml` — the AWS `deploy` job is now marked **DEAD PATH** in a
comment: it references an OIDC provider, deploy role, ECR repos and ECS resources
that no longer exist. It stays only as the *shape* of a deploy (build → push →
migrate → deploy → health gate) which OCI-04 re-implements against OKE. It cannot
fire accidentally — it is gated on `DEPLOY_ENABLED == 'true'`, which is not set.

## Files

- `.github/workflows/ci.yml` (deploy job marked dead pending OCI-04)
- `docs/PROVISIONING-AWS.md`, `docs/HANDOFF-WS20.md` (marked historical — the
  resources they describe no longer exist)
- `BACKLOG.md` (OCI-06 done), `CLAUDE.md`

## Result

**AWS spend on this project is now zero.** The remaining infrastructure work is
OCI-02 (owner-run signup + console verification) onward.
