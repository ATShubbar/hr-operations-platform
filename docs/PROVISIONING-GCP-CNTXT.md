# Google Cloud Dammam via CNTXT — provisioning guide (WS-20/21)

Per ADR-006 rev. 3. **Access model:** KSA-based customers purchase Google
Cloud Dammam (`me-central2`) exclusively through CNTXT
(https://cntxt.com — Google Cloud's regional reseller; Aramco/Cognite JV).
There is no self-service path. OCI remains the recorded fallback if CNTXT
onboarding stalls.

## 1. Start CNTXT onboarding — [owner], today

1. Submit the inquiry: https://content.cntxt.com/gcp-online-waiting-list
   (CNTXT's GCP signup/waiting-list form) or the general contact on
   https://cntxt.com. Have ready:
   - Company legal name + CR (commercial registration) number
   - Contact person, role, email, phone
   - Brief workload description (template below)
2. **Inquiry template** (adapt freely):
   > We are a Saudi HR consultancy building an HR operations platform
   > (recruitment, GRO, employee management) for our client companies.
   > We require Google Cloud services in the Dammam region (me-central2)
   > for PDPL/data-residency compliance. Initial footprint is small:
   > Cloud SQL for PostgreSQL (v16, HA), Memorystore for Redis,
   > Cloud Storage, and container hosting (Cloud Run or GKE Autopilot)
   > for two services, with CI/CD from GitHub Actions. We'd like to
   > understand onboarding steps, timeline, and commercial terms.
3. Log dates + responses in the Status log below — the timeline is the
   project risk here, not the technology.

## 2. Service verification checklist — once console access exists

Same discipline as the AWS/OCI checklists (create nothing, just verify in
`me-central2`):

- [ ] Cloud SQL for PostgreSQL — version 16 creatable, HA option
- [ ] Memorystore (Redis) creatable
- [ ] Cloud Storage bucket in me-central2
- [ ] Cloud Run (preferred) or GKE Autopilot available for api/web
- [ ] Workload Identity Federation for GitHub Actions (keyless deploys)

Any gap → record here + in ADR-006; Postgres missing entirely → fallback
clause (OCI) triggers.

## 3. What follows — [assisted, in-session]

- Project/folder layout, billing linkage via CNTXT, budget alert.
- Cloud SQL Postgres 16 (HA) + Memorystore + GCS bucket + Artifact
  Registry + Cloud Run services behind a load balancer.
- Migrations once, then rotate `app_staff`/`app_client` passwords into
  Secret Manager (closes the WS-13 flag).
- `deploy.yml`: build → Artifact Registry → migrate → deploy → health gate;
  one deliberate rollback evidenced (WS-20 DoD).
- WS-21: automated backups confirmed + restore test with measured RPO/RTO
  into ADR-006.

## Interim plan while CNTXT onboarding runs

The walking-skeleton **exit review (WS-22) proceeds without waiting**: the
deploy/backup items are recorded as an explicit, dated gap tied to CNTXT
onboarding, and Priority-2 module work (Auth, Audit, Clients) can start —
it runs against local Docker infra and is deploy-target-agnostic.

## Status log

- 2026-07-19: AWS path failed access verification (ADR-006 rev. 2);
  OCI fallback declined by owner; Google-via-CNTXT directed (rev. 3).
  CNTXT inquiry: ☐ submitted (date: ______)
