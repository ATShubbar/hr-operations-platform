# AWS UAE (me-central-1) — ACTIVE interim staging guide (WS-20/21)

Per ADR-006 rev. 4. This is the **interim staging** environment in the
existing AWS account. The KSA production target remains Google Dammam via
CNTXT (`docs/PROVISIONING-GCP-CNTXT.md`), with OCI as recorded fallback.

## ⚠️ The one hard rule

**No real client, employee, or candidate data ever enters this environment.**
Seed/demo data only. The KSA-residency principle applies to production
customer data; this environment must never hold any. Cutover to the KSA
region happens BEFORE the first real client onboards.

## 1. Enable the region + verify — [owner], ~15 min

1. Console → account name (top-right) → **Account** → **AWS Regions** →
   **Middle East (UAE)** → **Enable**. Wait a few minutes, then select
   **Middle East (UAE) me-central-1** in the region picker.
2. Verification checklist (open Create screens, create nothing):
   - [ ] RDS → Create database → PostgreSQL **16.x** offered
   - [ ] ElastiCache → Create cache → Redis/Valkey offered
   - [ ] S3 → Create bucket → me-central-1 selectable
3. If not done yet: **MFA on root**, and **Billing → Budgets** → monthly
   budget ~$50 with email alert.
4. Account hygiene footnote: root email is personal for now — rotate to a
   company address when one exists; 2FA on that inbox meanwhile.

## 2. Identity + deploy plumbing — [assisted, in-session]

- IAM Identity Center admin user for daily work (retire root usage).
- GitHub Actions **OIDC role** trusting
  `repo:ATShubbar/hr-operations-platform:ref:refs/heads/main` — no
  long-lived keys. Role ARN → GitHub repo variable.

## 3. Core staging infrastructure — [assisted, in-session]

- RDS PostgreSQL 16 (single-AZ is acceptable for staging; automated
  backups ON, 7-day retention), private subnet.
- ElastiCache (smallest node) or interim Redis container.
- S3 bucket (default encryption, block public access, versioning).
- ECR + ECS Fargate (api, web) behind an ALB, health-gated.
- Run migrations once; **rotate `app_staff`/`app_client` passwords** into
  SSM Parameter Store (closes the WS-13 flag).

## 4. WS-20/21 completion on this environment

- `deploy.yml`: build → ECR → migrate → deploy → `/health` gate; one
  deliberate rollback, evidenced.
- Backup schedule confirmed + snapshot **restore test** into a scratch
  instance; measured RPO/RTO recorded in ADR-006.
- Evidence records the environment as **interim staging (me-central-1)**
  with the KSA cutover as a tracked follow-up.

## 5. Migration plan to the KSA region (the "later" in migrate-later)

**Trigger:** CNTXT onboarding completes (Google Dammam), or AWS Saudi
(me-central-2) opens to standard accounts — whichever lands first and is
confirmed by the same service-verification checklist.

**Deadline rule:** cutover MUST complete before the first real client
onboards. This is what makes the migration trivial.

**Steps (no-production-data case — the planned path):**
1. Provision KSA equivalents (managed Postgres 16, Redis, object storage,
   container hosting) using this guide's shape.
2. Point `deploy.yml` at the new target (region/project variables + new
   OIDC/workload identity); run migrations fresh; seed.
3. Repoint DNS/secrets; verify health + isolation harness against the new
   environment; decommission the UAE data stores.
4. Update ADR-006 to final status with the KSA environment recorded.

**Contingency (if real data somehow exists before cutover — avoid):**
maintenance window + `pg_dump`/restore + S3 sync; Redis is cache/queues
only (never source of truth, ADR-008) — no Redis migration. This path
also requires a PDPL review of the interim period. The guard exists so
this paragraph is never used.

## Status log

- 2026-07-19: ADR-006 rev. 4 — UAE interim decided. Region enable: ✅
  Verification: RDS PG16 ✅  ElastiCache ✅  S3 ✅   Budget: ✅ ($50/mo)  Root MFA: ✅
