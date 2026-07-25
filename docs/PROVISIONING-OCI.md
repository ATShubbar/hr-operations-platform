# OCI Riyadh — ACTIVE provisioning guide (ADR-006 rev. 5 · ADR-010)

Per **ADR-006 rev. 5**: Oracle Cloud, home region **Saudi Arabia Central
(Riyadh)**, Jeddah as the second in-Kingdom region, **OKE (managed Kubernetes)**
as the runtime. Everything here is bound by **ADR-010 — the cloud portability
contract**.

This supersedes `docs/PROVISIONING-AWS.md` as the active target; that document
stays for the reasoning trail and for the teardown (OCI-06). Sections 1–3 below
carry over from the rev. 2 draft of this guide, which was never executed.

## ⚠️ Standing guards

1. **Seed/demo data only** until production readiness is signed off. Unlike the
   AWS UAE interim, this is *not* a residency problem — Riyadh satisfies KSA
   residency — it is an ordinary "not production-ready yet" gate.
2. **No provider SDK in `apps/`** (ADR-010 clauses 3, 5, 6). Object storage is
   reached through the **S3-compatible** endpoint; secrets arrive as environment
   variables. If application code has to change to run on OCI, that is a
   portability defect, not a task.
3. **Nothing below is assumed available.** ADR-006 rev. 1 asserted an AWS region
   that did not exist in our account partition because press coverage said it was
   GA. Every service is confirmed in *this account's console* first.
4. Budget alert before any compute exists. Record the ceiling in the status log.
5. Master/role passwords are never printed into a transcript or committed.

## 1. Account creation — [owner], ~20 min

Account creation and credential entry are the **owner's** to perform.

1. Sign up: https://signup.oraclecloud.com — company details as available
   (personal email interim is acceptable; rotate when a company address exists,
   2FA on that inbox meanwhile).
2. **Home region: "Saudi Arabia Central (Riyadh)"** — ⚠️ the home region CANNOT
   be changed after signup. If Riyadh is not offered, choose "Saudi Arabia West
   (Jeddah)"; if **neither** appears, STOP and report back — that reopens ADR-006.
3. Card required for identity verification; US$300/30-day trial credits plus
   always-free services. Trial → Pay As You Go upgrade happens later, before
   production resources.
4. Enable MFA on the initial admin user immediately (OCI prompts for this).
5. Subscribe the tenancy to **Jeddah** as an additional region (Governance →
   Regions) — needed for the DR story, free to subscribe.

## 2. Service verification — [owner], ~20 min, **create nothing**

Console region = Riyadh. Open each **Create** screen, confirm the option exists,
then cancel.

- [ ] **Databases → PostgreSQL** — "Create PostgreSQL database system" opens with
      **PostgreSQL 16.x** offered. Must support the ADR-001 two-role pattern
      (`app_staff` / `app_client` with RLS) — i.e. ordinary role management
- [ ] **Developer Services → Kubernetes Clusters (OKE)** — cluster creatable in
      Riyadh. Note the **control-plane charge** and the **node shapes** offered;
      check whether **Ampere A1 free-tier capacity** is available, as it
      materially changes cost
- [ ] **Databases → OCI Cache** (Redis-compatible) — creatable in Riyadh?
      Record yes/no. If **no** → Redis runs as a container in the cluster, which
      is acceptable (never source-of-truth: ADR-008, ADR-010 clause 4)
- [ ] **Storage → Object Storage** — bucket creatable in Riyadh
- [ ] **Identity → My profile → Customer secret keys** — an **S3-compatibility**
      key pair can be created. *This is what the application uses* (ADR-010
      clause 3); record the S3-compat endpoint form
- [ ] **Developer Services → Container Registry (OCIR)** — available for
      `hr-api` and `hr-web`
- [ ] Deploy identity for GitHub Actions — prefer OIDC/workload-identity
      federation over a long-lived key; record the mechanism actually available

Record each answer **with its date and observed value** in the ADR-006 rev. 5
checklist, then append a line to the status log below.

**PostgreSQL missing in Riyadh** → re-check in Jeddah. Missing in both → STOP and
reopen ADR-006. The fallback is *not* self-managed Postgres (rejected for this
team size).

## 3. Budget guardrail — [owner], 3 min

**Billing & Cost Management → Budgets** → monthly budget (~$50 to start) with an
email alert rule.

## 4. Access for the assisted steps — [owner]

Create an API signing key and configure the local CLI profile (`~/.oci/config`).
The assisted steps run against that profile — same shape as the AWS
`ahmed-admin` profile.

## 5. Build sequence — [assisted, in-session]

| Task | What |
|---|---|
| OCI-03 | Terraform: compartment, VCN + subnets, managed PostgreSQL, bucket, OKE cluster, OCIR. Provider-specific by design (an ADR-010 non-goal) — the portable artifact is the **topology**, not the HCL |
| OCI-04 | `infra/k8s/` manifests (Deployment · Service · Ingress · migration Job) + the GitHub Actions deploy job (build → push → migrate → apply → health gate) + one deliberate rollback → **closes WS-20** |
| OCI-05 | Automated backups + restore test, executed as the **ADR-010 exit drill**: restore into Postgres on *different* infrastructure and boot the app against it with only env vars changed. Record measured RPO/RTO → **closes WS-21** |
| OCI-06 | AWS UAE teardown (stops the ~$22/mo ALB meter); the account may stay dormant at zero cost |

Along the way: migrations run once, then `app_staff`/`app_client` passwords are
rotated off dev defaults (closes the WS-13 flag). They may be **stored** in OCI
Vault, but they reach the app as **environment variables injected at deploy
time** — no vault SDK in application code (ADR-010 clause 5).

Keep the manifest set minimal: Deployment, Service, Ingress, migration Job. No
service mesh, no operators, no third-party Helm charts. Kubernetes complexity is
the accepted cost of portability, not an invitation to spend it.

## 6. Migration plan (the "later" in migrate-later)

The point of ADR-010. To move to AWS/GCP/anyone:

1. Re-express the Terraform topology against the new provider (network, managed
   Postgres, bucket, cluster, registry).
2. `kubectl apply` the **same** manifests from `infra/k8s/`, with a new image
   registry and new env values.
3. `pg_dump` → `pg_restore` into the new managed Postgres.
4. Copy the bucket (S3-compatible at both ends). Egress is the real bill — the
   bucket's size is tracked in the status log so an exit is **costed, not
   guessed**.
5. Repoint DNS.

Steps 2–4 are exactly what the OCI-05 drill rehearses. Until that drill has run,
this plan is a claim rather than a path.

## Status log

- 2026-07-19: AWS account created, then the AWS path abandoned at region
  verification (ADR-006 rev. 2). Account kept dormant, zero resources.
- 2026-07-25: **ADR-006 rev. 5** — owner chose OCI with an explicit migratability
  condition, recorded as **ADR-010** (six interface clauses, each with a detection
  method); **OKE** selected as the runtime for exactly that reason. No account
  yet, no resources, no cost. Next: owner performs §1–§4 (task OCI-02).
- _(append: date · what was verified or created · observed values · cost impact)_
