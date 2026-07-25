# ADR-010 — Cloud portability: the provider-neutral interface contract

- Status: **Accepted**
- Date: 2026-07-25
- Owner: Ahmed Alshubbar

## Context

ADR-006 (rev. 5) selects **Oracle Cloud (OCI), Riyadh** as the host. The owner
attached a condition to that choice: whatever we build must be **migratable
later** — to AWS, Google, or anyone else — without a rewrite.

That condition needs to be a contract, not an intention. Provider lock-in is not
usually chosen; it accumulates, one convenient proprietary call at a time, and is
discovered only when leaving. It is also the case that ADR-006 has now changed
provider three times in a week for reasons entirely outside our control (a region
that did not exist in our account partition, a reseller-only region, a restricted
new account). **A fourth change should cost days, not months.** Portability here
is not a hypothetical future benefit; it is a hedge against a risk that has
already materialised repeatedly.

The opposite failure is equally real: "cloud-agnostic" architectures that refuse
managed services, wrap every provider behind a bespoke abstraction layer, and pay
a permanent complexity tax for a migration that may never happen. This ADR draws
the line explicitly.

## Options considered

1. **No portability constraint** — use whatever OCI offers, most convenient path.
   Cheapest now; a later move is a rewrite of storage, deploy, and runtime. Given
   ADR-006's track record, rejected.
2. **Full cloud-agnostic abstraction layer** — internal interfaces over every
   provider service, multi-cloud from day one. Permanent complexity tax on a
   one-person team for a speculative benefit. Rejected.
3. **Portability at the interfaces only** — lock the *contracts* (container,
   Postgres wire protocol, S3 API, Redis protocol, env-var config) and accept
   provider-specific glue *outside* the application (Terraform, CI plumbing).
   Chosen.

## Decision

Option 3. Portability is enforced at six interfaces. **Each clause names how a
violation is detected** — a portability rule nobody can check is a wish.

| # | Clause | Why it ports | How a violation is caught |
|---|---|---|---|
| 1 | **Runtime is containers, orchestrated by Kubernetes.** Deployment/Service/Ingress manifests are the deployment contract; no proprietary serverless runtime. | The same manifests apply to EKS, GKE, AKS. Migration is repoint-and-apply. | Manifests live in `infra/k8s/`; anything provider-specific there is a review defect. A second cluster (kind/minikube) can apply them unchanged. |
| 2 | **Database is vanilla PostgreSQL 16 over a connection URL.** No provider-only extensions, no Aurora/AlloyDB-only features, no proprietary SQL. | Every cloud sells stock Postgres; `pg_dump`/`pg_restore` is the move. | Migrations already run against plain Postgres 16 in CI and locally (`docker compose`). A provider-only feature would break CI on the first push. |
| 3 | **Object storage is accessed ONLY through the S3-compatible API.** The OCI SDK must never appear in application code. | OCI, AWS, GCP, MinIO, Cloudflare R2 all speak S3. Already true: `StorageService` is endpoint-configurable with `forcePathStyle` and runs on MinIO locally. | Greppable: no `oci-sdk`/`oci-common` import may exist under `apps/`. The local MinIO test suite (STOR-01) is the standing proof the code is not AWS-specific either. |
| 4 | **Cache is Redis over a URL and is never source-of-truth** (restates ADR-008). | A Redis URL is satisfiable by a managed service, a container, or a VM anywhere. | Losing Redis must cost sessions and queued jobs, never data — already the case; a durable-state-in-Redis change would have to defeat the existing schema-owned data model. |
| 5 | **Configuration and secrets reach the app as environment variables**, injected at deploy time. No cloud secret-manager SDK calls in application code. | Swapping OCI Vault for SSM/Secret Manager becomes a pipeline change, not a code change. | Same grep rule as clause 3; the app's config surface is env-only today. |
| 6 | **No provider metadata/identity services in application code** — no instance principals, no IMDS calls. Credentials are deploy-time only. | The app cannot tell which cloud it is on, so it does not care. | Grep for metadata endpoints (`169.254.169.254`, `oci-metadata`); none should exist. |

### Explicit non-goals

- **No multi-cloud abstraction layer.** One provider at a time.
- **No avoiding managed services.** Managed Postgres is preferred; self-managing
  production Postgres stays rejected (ADR-006).
- **Terraform code is NOT portable and is not expected to be.** It is
  provider-specific by nature. What ports is the *topology and the runbook*: the
  same set of resources (network, managed Postgres, cache, bucket, cluster,
  ingress) re-expressed against another provider. Terraform's value here is that
  the topology is written down and re-implementable, not that it is reusable.
- **No active-active or hot standby on a second cloud.** Out of scope.

### The exit drill (what makes this real)

A migration path that has never been executed is a claim. So:

> **The WS-21 backup/restore test doubles as the migration rehearsal.** The drill
> passes when a production-shaped dump is restored into a Postgres instance **on
> different infrastructure** and the application boots against it, unmodified,
> with only environment variables changed.

If that drill passes, the move is: apply Terraform for the new provider, apply the
same manifests, restore the dump, copy the bucket, repoint DNS. If it does not
pass, we have discovered lock-in while it is still cheap.

**Data gravity is bounded on purpose:** object storage is the only large data
store, and its size is recorded in the provisioning status log so an exit can be
costed (egress) rather than guessed at.

## Consequences

- **Easier:** changing provider — the fourth ADR-006 revision, if it comes, is a
  Terraform module and a CI job, not an application change. Local development
  already mirrors production interfaces (Postgres, Redis, MinIO in
  `docker compose`), which is what makes these clauses cheap to honour.
- **Harder:** we forgo provider-native conveniences (OCI Vault SDK integration,
  provider-specific autoscaling primitives, managed-service features that only
  exist on one cloud). Each is a deliberate, small cost.
- **New burden:** Kubernetes. OKE was chosen (ADR-006 rev. 5) precisely because
  manifests are the most portable runtime contract available, but it is real
  operational complexity for a one-person team. Mitigation: the manifest set stays
  minimal — Deployment, Service, Ingress, a migration Job. **No service mesh, no
  operators, no Helm charts we did not write.**
- **A violation is a review defect, not a preference.** The clauses above are the
  standard a change is measured against; adding a provider SDK to `apps/` requires
  superseding this ADR, not a judgement call in a PR.
- Storage already satisfies clause 3 by construction (STOR-01 chose an
  endpoint-configurable S3 client for exactly this reason) — that decision is now
  load-bearing rather than incidental.

## Links

- ADR-006 (provider selection, rev. 5 — OCI Riyadh + OKE), ADR-008 (modular
  monolith, single deployment, Redis never source-of-truth), ADR-001 (the two-role
  Postgres pattern the managed instance must support)
- `docs/PROVISIONING-OCI.md` — the runbook, verification checklist and status log
- `ACTION-PLAN.md` 0.6; `BACKLOG.md` WS-20/21 and the OCI epic
