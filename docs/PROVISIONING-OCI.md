# ⛔ SUPERSEDED by owner directive — see PROVISIONING-GCP-CNTXT.md (ADR-006 rev. 3); this OCI guide remains the recorded fallback

# OCI Saudi provisioning guide — WS-20/21

Per ADR-006 rev. 2: AWS me-central-2 proved inaccessible to standard accounts;
fallback to Oracle OCI with **home region Saudi Arabia Central (Riyadh)** and
Jeddah available as the second in-Kingdom region.

## 1. Account creation — [owner], ~20 min

1. Sign up: https://signup.oraclecloud.com — company details as available
   (personal email interim is acceptable; same follow-up rule as before:
   rotate when a company address exists, 2FA on the inbox).
2. **Home region: choose "Saudi Arabia Central (Riyadh)"** — ⚠️ the home
   region CANNOT be changed after signup. If Riyadh is not offered in the
   dropdown, choose "Saudi Arabia West (Jeddah)"; if NEITHER appears, STOP
   and report back — that reopens ADR-006 again.
3. Card required for identity verification; you get US$300/30-day trial
   credits plus always-free services. Trial → Pay As You Go upgrade happens
   later, before provisioning production resources.
4. Enable MFA on the initial admin user immediately (OCI prompts for this).

## 2. Service verification checklist — [owner], 5 min, create nothing

In the OCI console (region: Riyadh), use the top-left hamburger menu:

- [ ] **Databases → PostgreSQL** — does "Create PostgreSQL database system" open with PostgreSQL 15/16 offered? (This is "OCI Database with PostgreSQL".)
- [ ] **Databases → OCI Cache** (Redis-compatible) — creatable in Riyadh?
- [ ] **Storage → Object Storage** — bucket creatable? (S3-compatible API is standard on OCI.)

Record answers in ADR-006's checklist. PostgreSQL missing in Riyadh → check
region picker for Jeddah and re-check there (we can subscribe to Jeddah as an
additional region). Missing in both → STOP, reopen ADR-006.

## 3. Budget guardrail — [owner], 3 min

Hamburger menu → **Billing & Cost Management → Budgets** → create a monthly
budget (~$50 to start) with an email alert rule.

## 4. What follows — [assisted, in-session]

- Compartment layout, VCN, and the GitHub Actions deploy identity
  (OCI supports OIDC-style workload identity federation; verified at setup).
- Managed PostgreSQL 16 (HA), OCI Cache, Object Storage bucket, container
  registry + compute for api/web behind a load balancer.
- Migrations run once, then rotate `app_staff`/`app_client` passwords into
  OCI Vault (closes the WS-13 flag).
- `deploy.yml` with health-gated rollout + one deliberate rollback (WS-20 DoD),
  then the WS-21 backup schedule + restore test with measured RPO/RTO.

## Status log

- 2026-07-19: AWS account created, then AWS path abandoned at region
  verification (see ADR-006 rev. 2). AWS account kept dormant, zero resources.
