# WS-20 in-flight handoff — AWS UAE staging (written 2026-07-19)

Session handoff: exact infra state + remaining sequence. Region:
**me-central-1**, account **075483720704**, CLI profile configured locally
as IAM user `ahmed-admin`.

## Created and live

| Resource | Value |
|---|---|
| OIDC provider | `token.actions.githubusercontent.com` (aud sts.amazonaws.com) |
| Deploy role | `arn:aws:iam::075483720704:role/hr-platform-deploy` (trusts repo ATShubbar/hr-operations-platform, branch main) |
| ECR | `hr-api`, `hr-web` @ 075483720704.dkr.ecr.me-central-1.amazonaws.com |
| S3 | `hr-platform-staging-075483720704` (versioned, private) |
| VPC / subnets | default `vpc-076f70bc364c545e3`; subnets `subnet-00e08925f1405d04e`, `subnet-073fc4a972274d7d4` |
| Security groups | ALB `sg-0d08b928e249ff4d6` (80←world) · app `sg-04307ab0b644ff608` (3000-3001←ALB) · db `sg-08b06e817e843401c` (5432←app) |
| Task roles | `hr-task-execution` (ECS exec + SSM /hr/* read) · `hr-task-role` (S3 bucket access) |
| Log groups | `/hr/api`, `/hr/web` |
| ALB | `hr-staging-alb` → DNS `hr-staging-alb-1441042291.me-central-1.elb.amazonaws.com`; listener :80 → hr-web-tg default; rule prio 10 paths `/health,/ready,/example/*,/example-consumer/*,/scope-check*` → hr-api-tg |
| Target groups | `hr-api-tg` (3001, hc /health) · `hr-web-tg` (3000, hc /en) |
| SSM | `/hr/staging/db/master-password` (SecureString; never printed) |

## Blocked at handoff time

`aws ecs create-cluster --cluster-name hr-staging` → ThrottlingException;
`aws rds create-db-instance …` → "CreateDBInstance is not available in this
region". Both are **new-account restrictions** (region itself verified fine:
orderable db.t4g.micro PG 16.11). Support case raised (Account and billing /
verification). A local background retry ran attempts every 5 min on
2026-07-19; it dies with that session — **re-check manually on pickup**.

## Remaining sequence (in order)

1. Retry until both succeed:
   - `aws ecs create-cluster --cluster-name hr-staging`
   - `PW=$(aws ssm get-parameter --name /hr/staging/db/master-password --with-decryption --query Parameter.Value --output text)`
   - `aws rds create-db-instance --db-instance-identifier hr-staging-pg --engine postgres --engine-version 16.11 --db-instance-class db.t4g.micro --allocated-storage 20 --storage-type gp3 --master-username hr --master-user-password "$PW" --db-name hr_platform --vpc-security-group-ids sg-08b06e817e843401c --backup-retention-period 7 --no-publicly-accessible --no-multi-az`
2. `aws rds wait db-instance-available --db-instance-identifier hr-staging-pg`, get endpoint via `describe-db-instances`.
3. Write SSM params (SecureString) — owner URL now, role URLs after step 5:
   `/hr/staging/db/url` = `postgresql://hr:<PW>@<endpoint>:5432/hr_platform`
4. Run the migrate one-off task (ECS run-task, task def from
   `infra/ecs/task-migrate.json`, app SG + subnets above, public IP ENABLED)
   — or run migrations from a bastionless psql if simpler at first setup.
5. **Rotate role passwords** (WS-13 flag): generate two strong passwords,
   `ALTER ROLE app_staff/app_client PASSWORD …` via the migrate task or a
   one-off psql task; store as
   `/hr/staging/db/staff-url` and `/hr/staging/db/client-url` (full URLs).
6. Create ECS services (Fargate, desired 1, app SG, both subnets, public IP
   ENABLED, target groups above): `hr-api` (container api:3001 → hr-api-tg),
   `hr-web` (web:3000 → hr-web-tg). First register task defs from
   `infra/ecs/task-*.json` with a pushed image (or let the pipeline do the
   first register; create services after first images exist in ECR).
7. Owner flips GitHub repo variable `DEPLOY_ENABLED=true`
   (Settings → Secrets and variables → Actions → Variables).
8. Push to main → deploy job runs: build/push images → register task defs →
   migrate task → update services → health gate on the ALB `/health`.
9. WS-20 evidence: deploy run URL + one **deliberate rollback** (re-deploy
   previous task def revision, health-gate again).
10. WS-21: confirm automated backups (7-day retention set), snapshot →
    **restore test** into scratch instance, boot app against it, record
    measured RPO/RTO in ADR-006 + evidence/skeleton/WS-21.md.
11. WS-22 exit review per BACKLOG card (KSA-cutover recorded as tracked gap
    per ADR-006 rev. 4 — interim staging only, **no real client data ever**).

## Standing guards

- **No production/client data in this environment. Seed/demo only.**
- Budget alarm $50/mo active; raise deliberately when services go live.
- Root email is personal (interim) — rotate when company address exists.
- Cost meter currently: ALB only (~$0.03/h). RDS/Fargate add ~$40-55/mo when up.

## Retry outcome (2026-07-19 ~14:25)

Background retry: 36 attempts / 3 hours + manual attempt — RDS and ECS
creation still blocked ~4h after account creation. **Support case is the
critical path.** On pickup: check the support case reply first (root email
inbox / Support Center), then rerun step 1 of the sequence above.
