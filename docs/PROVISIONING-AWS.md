# ⛔ SUPERSEDED — see PROVISIONING-GCP-CNTXT.md and ADR-006 rev. 3
# (me-central-2 proved inaccessible to standard AWS accounts, 2026-07-19)

# AWS Riyadh (me-central-2) provisioning guide — WS-20/21

The owner-side steps to stand up the KSA environment per ADR-006. Do them in
order; steps marked **[owner]** need your account/billing access, steps marked
**[assisted]** we do together in a session once credentials exist.

## 1. Account foundation — [owner], ~30 min

1. Create the AWS account (or use an existing organization): https://aws.amazon.com — **Paid plan** (per ADR-006 discussion: same $200 credits, no 6-month auto-close, no service restrictions). Enable MFA on the root user immediately, then create an IAM Identity Center (SSO) admin user for daily work. Never use root again.
   - *2026-07-19: account created with a personal root email as an interim measure.* **Follow-up:** rotate the root email to a company address when one exists (Account settings → Edit → email); until then the personal inbox must itself have 2FA — it can reset the root password.
2. In the console, switch region to **Middle East (Riyadh) — me-central-2** (top-right region picker). New accounts may need to *enable* the region: Account settings → Regions → enable me-central-2.
3. **Verification checklist from ADR-006** (5 minutes, before any money is spent):
   - Open RDS → Create database → is **PostgreSQL 16** offered in me-central-2?
   - Open ElastiCache → Create cache → is **Redis or Valkey** offered?
   - Open S3 → Create bucket → me-central-2 selectable?
   - Record all three answers in ADR-006's checklist. If RDS is missing → stop, we regroup on OCI per the ADR fallback.
4. Set a billing alarm: Billing → Budgets → create a monthly budget with an alert (e.g., $200 to start).

## 2. GitHub Actions OIDC role — [assisted], ~20 min

No long-lived AWS keys in GitHub. We create an IAM OIDC identity provider for
`token.actions.githubusercontent.com` and a deploy role trusting
`repo:ATShubbar/hr-operations-platform:ref:refs/heads/main`, with permissions
scoped to ECR push + ECS deploy + (temporarily) RDS migrate access via a
bastion-less approach. Done together in-session; the role ARN then goes into a
GitHub Actions repo variable.

## 3. Core infrastructure — [assisted], ~1–2 h

Provisioned together (console-first is fine at this stage; IaC is a post-
skeleton task):

- **VPC**: default VPC is acceptable for the skeleton; private subnets for RDS/ElastiCache.
- **RDS PostgreSQL 16**: Multi-AZ, smallest production class to start, automated backups ON (7-day retention to start), deletion protection ON.
- **ElastiCache** (Redis/Valkey): single small node to start.
- **S3**: one bucket, default encryption, block public access, versioning ON.
- **ECR + ECS Fargate**: two services (api, web) behind an ALB — the deploy target for `deploy.yml`.
- After RDS exists: run migrations once from the session, then **rotate `app_staff`/`app_client` passwords** (`ALTER ROLE … PASSWORD`) and store them in SSM Parameter Store (SecureString) — closing the WS-13 flag.

## 4. What happens after (my side)

- `deploy.yml`: build images → push ECR → migrate → deploy ECS → health-gate on `/health`; one deliberate rollback performed and evidenced (WS-20 DoD).
- WS-21: confirm the RDS backup schedule, run a snapshot **restore test** into a scratch instance, boot the app against it, record measured RTO + RPO in ADR-006.

## Cost expectation (order of magnitude, verify at provisioning)

Smallest sensible production shapes in a new region: RDS Multi-AZ small class + ElastiCache small node + Fargate ×2 + ALB — typically low hundreds of USD/month. The dev/staging trick to halve it early: single-AZ RDS until first client data arrives, then flip Multi-AZ.
