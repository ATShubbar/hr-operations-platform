# ADR-006 — KSA cloud provider selection

- Status: **Accepted, rev. 7** (2026-10-04 — **Google Cloud**, project `peoplegro-prod`, runtime **Cloud Run** with a bounded **exception to ADR-010 clause 1**. **UAT in `me-central1` (Doha), sample data only**; **production stays in the Kingdom — `me-central2` access for Cloud Run is gated, so the production path is open (GCP-07)**. Every service line is still an unchecked box until seen in the project's own console — see the checklist in docs/PROVISIONING-GCP.md.)

> **Revision note 7 (2026-10-04, same day):** GCP-02's read-only checks found
> that this project **cannot use Cloud Run in `me-central2`**: every Cloud Run
> call there (services, jobs, domain mappings) is refused with *"Access to the
> region is unavailable. Please contact our sales team"*
> (`LOCATION_POLICY_VIOLATED`). The organization's own location policy allows
> everything (`gcp.resourceLocations` → `allValues: ALLOW`), so the gate is
> Google's: the console LISTS Dammam, but use of it is gated (as rev. 3 found,
> KSA customers reach Dammam through Google's sales channel / CNTXT). Compute
> Engine in `me-central2` shows a real quota (72 CPUs, 24 instances); Cloud SQL
> and Memorystore creation there is UNPROVEN (listing works; nothing was created
> to test it). Cloud Run in `me-central1` (Doha) and `europe-west1` is open.
>
> **Owner decision:** **UAT runs in `me-central1` (Doha, Qatar)** — Cloud Run,
> Cloud SQL, Memorystore, bucket and registry all there — under a hard rule:
> **sample (seed) data only; no real client, employee or candidate data may ever
> enter UAT.** UAT holds no personal data, so the KSA-residency principle (which
> governs real data) is not engaged — the same reasoning as rev. 4's interim
> environment. **Production stays in the Kingdom**; HOW is an open card
> (GCP-07): get Cloud Run opened in `me-central2` via Google sales / CNTXT, or
> run production in `me-central2` on GKE / VMs if Cloud SQL and Memorystore can
> be created there (one tiny test instance, owner-approved, settles it), or an
> in-Kingdom alternative provider. Moving UAT later is repoint-and-redeploy.

> **Revision note 6 (2026-10-04):** Owner decision: **Google Cloud, Dammam
> (`me-central2`)**, replacing OCI (rev. 5). The owner created project
> **`peoplegro-prod`** and saw, in that project's own console (2026-09): Cloud
> SQL for PostgreSQL (16 offered — **use 16**, matching local and CI), GKE,
> Memorystore, Cloud Storage buckets with HMAC interoperability keys, Artifact
> Registry and Workload Identity Federation — all in `me-central2`. Rev. 3's
> CNTXT reseller gate no longer blocks: the project exists and is usable.
> Residency is satisfied by geography (Dammam is in the Kingdom).
>
> **Decisions made with this revision (owner, 2026-10-04):**
>
> | Topic | Decision |
> |---|---|
> | Runtime | **Cloud Run** (cost), NOT GKE — an exception to ADR-010 clause 1, bounded below |
> | Environments | **UAT** (sample data only) at **`uat.peopleandgro.com`** first; **production** at **`app.peopleandgro.com`** later |
> | Projects | **One project** (`peoplegro-prod`) for both. Isolation by **name prefix** (`uat-*`, `prod-*`) and **one service account per environment per service**; UAT accounts get NO access to production's database, bucket or secrets. Weaker than separate projects — accepted for simplicity and recorded as such |
> | DNS | Stays at **Hostinger** (`peopleandgro.com`); the owner adds one record per environment |
> | UAT email | **None sent.** The capture transport stays on (mail is recorded in logs); real SMTP arrives with production |
>
> **The worker must not sleep.** BullMQ consumers (email dispatch, the daily
> 06:00 Asia/Riyadh expiry scan, EXP-02) need a continuously running process.
> Cloud Run scales to zero and throttles CPU between requests by default, which
> would make those jobs silently not run. So the deployment is **two services
> from ONE image**: `*-api` (request-driven, the HTTP app WITHOUT the worker)
> and `*-worker` (min instances 1, **CPU always allocated**, no public ingress)
> — plus `*-web` (Next.js) and a `*-migrate` Cloud Run **job**. Splitting the
> worker out of the API process is a code change (today `MainModule` runs both
> in one process) and belongs to GCP-04.
>
> **The ADR-010 exception, bounded.** Clause 1 asks for Kubernetes manifests as
> the deployment contract; Cloud Run is a proprietary runtime. What still holds,
> and keeps a move cheap:
>
> - **The artefacts are plain OCI/Docker images** built from the repo's
>   Dockerfiles. Nothing in the image is Cloud-Run-specific; the app reads
>   `PORT` and env vars only.
> - **Clauses 2–6 hold unchanged:** Cloud SQL is stock Postgres 16 over a URL;
>   storage via the S3-compatible API (GCS interoperability + HMAC keys); Redis
>   (Memorystore) over a URL, never source-of-truth; config and secrets as env
>   vars (Secret Manager values are injected by Cloud Run at deploy time — the
>   app never calls the Secret Manager SDK); no metadata-server calls in app code.
> - **The move-away plan** (to GKE, or any Kubernetes): write Deployment /
>   Service / Ingress / Job manifests for the SAME images (`api`, `worker`, `web`,
>   `migrate`), reusing the same env-var set; repoint DNS. No code changes. The
>   service list above IS the topology the manifests would express.
> - **Detection** stays as ADR-010 defines it (greps for provider SDKs and
>   metadata endpoints under `apps/`), with one addition: no
>   `@google-cloud/*` package may appear in `apps/*/package.json`.
>
> **What this revision still does NOT claim.** Prices in `me-central2`, Cloud
> Run custom-domain mapping availability in `me-central2` (if absent, a small
> global HTTPS load balancer with a serverless NEG fronts the services),
> Memorystore tiers, and Direct VPC egress support are **checked in the console
> before each paid resource is created** (GCP-02/03), not assumed here. Cost
> checks are logged in the runbook.
>
> **Supersedes:** rev. 5 (OCI) — no OCI resources were ever created; OCI-02..05
> are closed as superseded. `docs/PROVISIONING-OCI.md` and
> `docs/PROVISIONING-GCP-CNTXT.md` become historical.

> **Revision note 5 (2026-07-25):** Owner decision: **move to OCI**, with an
> explicit condition — *whatever we do must be easily migratable later to AWS,
> Google, or any other provider*. That condition is recorded as its own decision,
> **ADR-010 (cloud portability)**, which locks six interfaces (containers +
> Kubernetes, vanilla Postgres over a URL, S3-compatible storage only, Redis over a
> URL, env-var config, no provider metadata calls) and pairs each with a detection
> method.
>
> **Why this is not just another swap.** OCI has **two in-Kingdom regions**
> (Riyadh + Jeddah) available by standard self-service signup. That dissolves the
> compromise rev. 4 was living with: the AWS UAE staging carries a hard
> no-real-data guard *because UAE violates the KSA-residency principle*. On OCI
> Riyadh, residency is satisfied by geography, so the guard becomes an ordinary
> production-readiness gate rather than a legal one. It also removes the reseller
> dependency (rev. 3, CNTXT) and the restricted-new-account block (rev. 4, still
> unresolved as of 2026-07-24 — ECS throttle and RDS `InvalidAction` persist).
>
> **Runtime: OKE.** Chosen over OCI Container Instances specifically for ADR-010:
> Deployment/Service/Ingress manifests are the most portable runtime contract
> available — the same YAML applies to EKS or GKE. Accepted cost: Kubernetes
> complexity for a one-person team, mitigated by keeping the manifest set minimal
> (Deployment, Service, Ingress, migration Job — no mesh, no operators).
>
> **What this revision deliberately does NOT claim.** Rev. 1 asserted a region
> that did not exist in our account partition because press coverage said it was
> GA. That lesson is now procedure: every service line below is an **unchecked
> box** until it is seen in the console of the actual account. Region identifiers,
> managed-Postgres availability, cache options, and free-tier capacity are all to
> be confirmed at provisioning (OCI-02), not asserted here.
>
> **AWS disposition:** the UAE staging resources are to be torn down once OCI is
> proven (the ALB alone meters ~$22/mo); the account may be kept dormant at zero
> cost. Tracked as OCI-06.

> **Revision note 4 (2026-07-19):** CNTXT onboarding requires legal documents not currently available, making the KSA target's timeline indefinite. Owner decision: stand up an **interim staging environment in AWS UAE (me-central-1)** — the existing AWS account, self-service, full managed stack — under this hard rule: **no real client, employee, or candidate data may ever enter the interim environment; seed/demo data only.** The KSA-residency principle governs production customer data, of which none exists yet; the guard keeps PDPL exposure at zero. Cutover to the KSA region MUST occur before the first real client onboards, at which point migration is repoint-and-redeploy with no data migration (stack is containerized and provider-portable by design; see the migration plan in docs/PROVISIONING-AWS.md). WS-20/21 mechanics (pipeline, rollback, backup/restore drill) are proven on the interim environment; the KSA cutover is an explicit tracked follow-up.

> **Revision note 3 (2026-07-19):** Owner declined the OCI fallback and directed the choice to **Google Cloud (me-central2, Dammam)**. Verified constraint from Google's authoritative access doc: KSA-based customers can purchase Dammam access **only through CNTXT**, the exclusive regional reseller — no self-service path exists. Consequences: (a) WS-20 deploy and WS-21 backups are gated on CNTXT commercial onboarding (timeline outside our control — days to weeks); (b) the walking-skeleton exit review (WS-22) proceeds with the deploy/backup gap explicitly recorded rather than blocking on the reseller; (c) service verification (Cloud SQL PostgreSQL 16, Memorystore Redis, GCS) happens once console access exists — same checklist discipline as before. OCI remains the recorded fallback if CNTXT onboarding stalls beyond an acceptable window.
- Date: 2026-07-18 (evaluation 2026-07-19; AWS decision 2026-07-19; fallback invoked same day)
- Owner: Ahmed Alshubbar

> **Revision note (2026-07-19):** The AWS choice failed provisioning-day verification at step zero: **me-central-2 does not exist in the standard AWS account partition.** The owner's live console offers only Bahrain/UAE in the Middle East, and AWS's authoritative regions documentation confirms it — the January 2026 "GA" reports were third-party claims about what appears to be a restricted/sovereign-partner launch (HUMAIN collaboration), not self-service availability. Bahrain/UAE violate the KSA-residency principle and were not considered. Per this ADR's own fallback clause, the decision moves to the runner-up: **OCI, home region Saudi Arabia Central (Riyadh), with Jeddah as the second in-Kingdom region.** Subject to the same at-signup service verification (managed PostgreSQL, cache, object storage) before provisioning. The dormant AWS account is kept (zero resources, zero cost) in case me-central-2 opens to standard accounts later.

## Context
All production data, backups, and logs must remain in Saudi Arabia (PDPL/residency principle). The provider choice determines whether we get **managed** PostgreSQL, Redis, and S3-compatible storage — or operate our own stateful services, a major hidden cost and reliability risk for a small team. It also determines pooler behavior relevant to ADR-001 (now moot per SPIKE-001: in-process pool, no external pooler needed at launch).

## Evaluation (researched 2026-07-19, web sources at bottom)

| Criterion | **AWS Riyadh** (me-central-2) | **Oracle OCI** (Riyadh + Jeddah) | **Google Cloud Dammam** (me-central2) | **Azure Saudi East** | **STC Cloud** |
|---|---|---|---|---|---|
| Region status | **GA since January 2026**, 3 AZs | Live: Jeddah (2020) + Riyadh — two in-Kingdom regions | Live since 2023 | **Not open** — Q4 2026 | Live (telco/sovereign) |
| Signup friction | Standard self-service AWS account | Standard self-service | **Exclusive reseller (CNTXT) only**, KSA-entity signup + waiting list | n/a until Q4 2026 | Enterprise sales motion |
| Managed PostgreSQL | RDS for PostgreSQL (Multi-AZ) reported available; **verify in console at provisioning** | OCI Database with PostgreSQL (managed) | Cloud SQL (subject to region service matrix via CNTXT) | Azure Database for PostgreSQL (when live) | Unclear self-service offering |
| Managed Redis | ElastiCache expected; **verify at provisioning** (new-region service ramp) | OCI Cache (Redis-compatible; verify region) | Memorystore (verify via CNTXT) | Azure Cache (when live) | Unclear |
| Object storage | **S3 native** (our storage layer is S3-compatible by design) | OCI Object Storage (S3-compat API) | GCS (S3-interop mode) | Blob (when live) | Varies |
| Ecosystem/tooling/hiring | Deepest; GitHub Actions OIDC deploys are first-class | Good | Good | Good | Limited |
| Notable risk | New region: possible service gaps + early pricing premium | Smaller managed-Postgres track record; OCI Cache regional availability | Reseller dependency for everything, incl. support | Timing | Depth of managed services |

## Recommendation (pending owner decision)

**Primary: AWS Riyadh (me-central-2).** GA now with 3 AZs, standard self-service signup (no reseller dependency), and the managed stack maps 1:1 onto our frozen architecture (RDS Postgres ↔ ADR-001 two-role pattern, ElastiCache ↔ Redis sessions/queues, S3 ↔ the storage module's S3-compatible design). Provisioning-day checklist must verify RDS PostgreSQL 16 and ElastiCache availability in-region before committing (new regions ramp services); if ElastiCache lags, interim Redis on a small container is acceptable (Redis is never source-of-truth per ADR-008).

**Runner-up: Oracle OCI.** The only option with **two** in-Kingdom regions today (Riyadh + Jeddah) — a genuinely better in-country DR story — and likely cheaper. Trade-off: less battle-tested managed Postgres and a thinner tooling ecosystem.

**Ruled out for now:** GCP Dammam (CNTXT reseller gate is disproportionate friction for this team), Azure (not open until Q4 2026), STC Cloud (no clear self-service managed Postgres).

## Decision (current — rev. 5)

**Oracle Cloud Infrastructure (OCI), home region Saudi Arabia Central (Riyadh),
with Jeddah as the second in-Kingdom region. Runtime: OKE (managed Kubernetes).**
Accepted by the owner 2026-07-25, subject to the verification below and bound by
**ADR-010 (cloud portability)**.

### Provisioning-day verification checklist (OCI-02 — nothing here is assumed)

Every box is filled from the **console of the actual account**, not from
documentation or press. Recorded with date and observed value.

- [ ] Account created, home region set to **Saudi Arabia Central (Riyadh)**; region identifier observed: `____________`
- [ ] Jeddah region subscribable (second in-Kingdom region for DR); identifier: `____________`
- [ ] **Managed PostgreSQL 16** creatable in Riyadh (OCI Database with PostgreSQL) — version observed: `______`
      — must support the ADR-001 two-role pattern (`app_staff` / `app_client` with RLS)
- [ ] **OKE cluster** creatable in Riyadh; control-plane cost observed: `______`; node shape + capacity: `____________`
- [ ] **Redis/cache**: managed offering available in Riyadh? `yes / no` → if no, Redis runs as a container in-cluster (acceptable: never source-of-truth, ADR-008)
- [ ] **Object Storage** bucket created in Riyadh **plus S3-compatibility credentials** (Customer Secret Key) — the S3-compat endpoint is what the app uses (ADR-010 clause 3); endpoint observed: `____________`
- [ ] **OCIR** (container registry) available for `hr-api` / `hr-web` images
- [ ] CI deploy identity that is **not** a long-lived personal key where avoidable; mechanism observed: `____________`
- [ ] `app_staff`/`app_client` passwords rotated from dev defaults (WS-13 flag)
- [ ] Budget alert configured; monthly ceiling: `______`
- [ ] RPO/RTO targets recorded: RPO ≤ `____`, RTO ≤ `____` (measured by the OCI-05 restore test)
- [ ] Backup schedule recorded: `____________`
- [ ] **Standing guard still in force** until production readiness is signed off: seed/demo data only

If managed PostgreSQL turns out to be unavailable or unsuitable in Riyadh, the
fallback is **not** self-managed Postgres (still rejected for this team size) —
it is to re-open this ADR. Jeddah is checked as the in-Kingdom alternative first.

## Decision (superseded — rev. 1, kept for the reasoning trail)
**AWS, region me-central-2 (Riyadh).** Accepted by the owner 2026-07-19.

Provisioning-day verification checklist (fill in during WS-20 provisioning; falls back to OCI per Consequences if the first two fail):
- [ ] RDS for PostgreSQL 16 creatable in me-central-2 (Multi-AZ)
- [ ] ElastiCache (Redis/Valkey) creatable in me-central-2 — if not: interim Redis container, revisit monthly
- [ ] S3 bucket in me-central-2 with default encryption
- [ ] GitHub Actions OIDC role (no long-lived keys)
- [ ] `app_staff`/`app_client` passwords rotated from dev defaults (WS-13 flag)
- [ ] RPO/RTO targets recorded: RPO ≤ ____ , RTO ≤ ____ (measured by WS-21 restore test)
- [ ] Backup schedule recorded: ____

## Consequences (rev. 5 — OCI)

- **KSA residency is satisfied by geography**, so the no-real-data guard becomes a
  production-readiness gate rather than a legal necessity. It stays in force until
  that readiness is signed off.
- **Two in-Kingdom regions** give a real in-country DR story (Riyadh primary,
  Jeddah for backups/DR) — something no other evaluated provider offers today.
- **Kubernetes is now our operational surface.** Accepted deliberately for
  portability (ADR-010 clause 1), with a minimal manifest set as the mitigation.
- **The migration path must be rehearsed, not assumed** — the OCI-05 restore test
  doubles as the cross-provider drill (ADR-010's exit drill). A dump that will not
  restore elsewhere is lock-in discovered while it is still cheap to fix.
- **Thinner ecosystem than AWS**: fewer worked examples, fewer hires who know it,
  a younger managed-Postgres track record. ADR-010 is the hedge — if OCI
  disappoints, leaving is a Terraform module and a CI job.
- **The AWS UAE staging is now cost with no purpose** (~$22/mo for the ALB alone)
  and is scheduled for teardown (OCI-06). The account may stay dormant at zero
  cost in case me-central-2 ever opens to standard accounts.
- Nothing in `apps/` should change to run on OCI. If something must, that is a
  portability defect and ADR-010 is the standard it failed.

## Consequences (rev. 1 — expected, AWS path)
- AWS path: GitHub Actions deploys via OIDC role (no long-lived keys); RDS automated backups + snapshot restore test satisfies WS-21; S3 bucket policies per-client-prefix per the storage design.
- If provisioning-day verification fails on RDS/ElastiCache in me-central-2, fall back to the OCI runner-up rather than self-managing Postgres — self-managed production Postgres remains explicitly rejected for this team size.

## Links
- **ADR-010 — cloud portability** (the migratability condition attached to rev. 5)
- `docs/PROVISIONING-OCI.md` — runbook, verification checklist, status log
- `architecture.md` — Infrastructure; ADR-001; ADR-008; `ACTION-PLAN.md` 0.6, WS-20/21
- Sources: [AWS Saudi region launch](https://press.aboutamazon.com/2024/3/aws-to-launch-an-infrastructure-region-in-the-kingdom-of-saudi-arabia), [me-central-2 GA / services overview](https://a9it.com/aws-me-central-2-saudi-arabia-region/), [DCD: AWS Saudi plans](https://www.datacenterdynamics.com/en/news/aws-plans-to-launch-saudi-arabian-cloud-region-in-2026-promises-53bn-investment/), [GCP Dammam access via CNTXT](https://docs.cloud.google.com/docs/dammam-region-access), [Oracle Riyadh region](https://www.oracle.com/sa/cloud/cloud-regions/riyadh/), [OCI Database with PostgreSQL](https://www.oracle.com/sa/cloud/postgresql/), [DCD: Oracle second Saudi region](https://www.datacenterdynamics.com/en/news/oracle-launches-second-saudi-arabian-public-cloud-region/), [Microsoft: Saudi region Q4 2026](https://news.microsoft.com/source/emea/2026/02/microsoft-confirms-saudi-arabia-datacenter-region-available-for-customers-to-run-cloud-workloads-from-q4-2026/), [MomentumX: Saudi cloud providers 2026](https://momentumx.cloud/saudi-cloud-providers-2026/)
