# ADR-006 — KSA cloud provider selection

- Status: **Accepted, rev. 4** (2026-07-19 — **interim staging on AWS UAE (me-central-1)** with a hard no-production-data guard; KSA target remains Google Dammam via CNTXT, with AWS Saudi as an alternative if it opens to standard accounts; OCI still the recorded fallback)

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

## Decision
**AWS, region me-central-2 (Riyadh).** Accepted by the owner 2026-07-19.

Provisioning-day verification checklist (fill in during WS-20 provisioning; falls back to OCI per Consequences if the first two fail):
- [ ] RDS for PostgreSQL 16 creatable in me-central-2 (Multi-AZ)
- [ ] ElastiCache (Redis/Valkey) creatable in me-central-2 — if not: interim Redis container, revisit monthly
- [ ] S3 bucket in me-central-2 with default encryption
- [ ] GitHub Actions OIDC role (no long-lived keys)
- [ ] `app_staff`/`app_client` passwords rotated from dev defaults (WS-13 flag)
- [ ] RPO/RTO targets recorded: RPO ≤ ____ , RTO ≤ ____ (measured by WS-21 restore test)
- [ ] Backup schedule recorded: ____

## Consequences (expected)
- AWS path: GitHub Actions deploys via OIDC role (no long-lived keys); RDS automated backups + snapshot restore test satisfies WS-21; S3 bucket policies per-client-prefix per the storage design.
- If provisioning-day verification fails on RDS/ElastiCache in me-central-2, fall back to the OCI runner-up rather than self-managing Postgres — self-managed production Postgres remains explicitly rejected for this team size.

## Links
- `architecture.md` — Infrastructure; ADR-001; ADR-008; `ACTION-PLAN.md` 0.6, WS-20/21
- Sources: [AWS Saudi region launch](https://press.aboutamazon.com/2024/3/aws-to-launch-an-infrastructure-region-in-the-kingdom-of-saudi-arabia), [me-central-2 GA / services overview](https://a9it.com/aws-me-central-2-saudi-arabia-region/), [DCD: AWS Saudi plans](https://www.datacenterdynamics.com/en/news/aws-plans-to-launch-saudi-arabian-cloud-region-in-2026-promises-53bn-investment/), [GCP Dammam access via CNTXT](https://docs.cloud.google.com/docs/dammam-region-access), [Oracle Riyadh region](https://www.oracle.com/sa/cloud/cloud-regions/riyadh/), [OCI Database with PostgreSQL](https://www.oracle.com/sa/cloud/postgresql/), [DCD: Oracle second Saudi region](https://www.datacenterdynamics.com/en/news/oracle-launches-second-saudi-arabian-public-cloud-region/), [Microsoft: Saudi region Q4 2026](https://news.microsoft.com/source/emea/2026/02/microsoft-confirms-saudi-arabia-datacenter-region-available-for-customers-to-run-cloud-workloads-from-q4-2026/), [MomentumX: Saudi cloud providers 2026](https://momentumx.cloud/saudi-cloud-providers-2026/)
