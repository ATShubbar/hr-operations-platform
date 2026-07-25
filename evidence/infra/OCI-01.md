# OCI-01 — ADR-006 rev. 5 (OCI) + ADR-010 (cloud portability) — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → OCI-01 (OCI epic; ADR-006, ADR-010)
- Status: done
- Commit: `OCI-01: ADR-006 rev. 5 — OCI Riyadh + OKE, with ADR-010 as the portability contract`

## What shipped

Documentation and decisions only. **No infrastructure was created, no application
code changed, no account exists yet.**

### ADR-006 rev. 5 — the provider decision

**OCI, home region Saudi Arabia Central (Riyadh)**, Jeddah as the second
in-Kingdom region, **OKE (managed Kubernetes)** as the runtime. Status is
deliberately **"Accepted pending provisioning-day verification"**.

Two things this revision establishes beyond the swap itself:

- **KSA residency is now satisfied by geography.** The AWS UAE interim (rev. 4)
  carried a hard *no-real-data* guard because UAE violates the residency
  principle. On Riyadh that guard downgrades to an ordinary production-readiness
  gate. It also removes the CNTXT reseller dependency (rev. 3) and the restricted
  new-account block (rev. 4 — still unresolved as of 2026-07-24).
- **It asserts nothing.** Rev. 1 claimed an AWS region that did not exist in our
  account partition because press coverage said it was GA. The verification
  checklist is therefore entirely **unchecked boxes** — region identifiers,
  managed-Postgres availability, cache options, free-tier capacity, registry,
  deploy identity — each to be filled with the date and the *observed* value from
  the account's own console (OCI-02). The saga is cited inside the ADR as the
  reason.

### ADR-010 — the portability contract (the owner's condition, made testable)

The owner's condition was "make sure whatever we do can be migrated easily later".
That is recorded as its own decision rather than a sentence in ADR-006, because it
governs *how* we build, not *where*.

Six clauses, **each paired with how a violation is detected** — a portability rule
nobody can check is a wish:

| # | Clause | Detection |
|---|---|---|
| 1 | Containers orchestrated by Kubernetes; manifests in `infra/k8s/` are the deploy contract | provider-specific YAML there is a review defect; manifests must apply to a local kind/minikube cluster unchanged |
| 2 | Vanilla PostgreSQL 16 over a URL — no provider-only SQL/extensions | CI + local `docker compose` already run stock Postgres 16; a provider-only feature breaks the first push |
| 3 | Object storage **only** via the S3-compatible API | greppable: no `oci-sdk`/`oci-common` under `apps/`; the MinIO suite (STOR-01) is standing proof the code is not AWS-specific either |
| 4 | Redis over a URL, never source-of-truth (restates ADR-008) | losing Redis costs sessions/jobs, never data |
| 5 | Config + secrets as env vars injected at deploy time; no secret-manager SDK in app code | same grep rule as (3) |
| 6 | No provider metadata/identity calls in app code | grep for `169.254.169.254` / metadata endpoints |

With **explicit non-goals** so this cannot inflate into an abstraction religion:
no multi-cloud layer, no avoiding managed services, **Terraform is not portable
and is not expected to be** (the portable artifact is the topology and runbook),
no second-cloud standby.

And an **exit drill** that makes the claim falsifiable:

> The WS-21 backup/restore test doubles as the migration rehearsal. It passes when
> a production-shaped dump restores into Postgres **on different infrastructure**
> and the app boots against it with only environment variables changed.

Data gravity is bounded on purpose — object storage is the only large store, and
its size is tracked in the provisioning log so an exit is costed, not guessed.

### Runbook + supersessions

- `docs/PROVISIONING-OCI.md` rewritten as the **ACTIVE** guide: standing guards,
  owner-run signup (§1), console service verification that creates nothing (§2),
  budget guardrail, CLI access, the OCI-03..06 build sequence, and the migration
  plan whose steps 2–4 are exactly what OCI-05 rehearses. The rev. 2 draft's
  useful specifics were kept (signup URL, the "if neither Riyadh nor Jeddah is
  offered, STOP — that reopens ADR-006" guard, trial credits).
- `docs/PROVISIONING-AWS.md` and `docs/PROVISIONING-GCP-CNTXT.md` carry
  **superseded banners** pointing at the OCI guide; the AWS one notes it is still
  needed for the teardown (OCI-06).
- `adr/README.md` index updated for both ADRs.

## Verification

```
grep -rn "oci-sdk\|oci-common\|169.254.169.254" apps/    # → no matches (clauses 3, 5, 6 hold today)
```

The clauses describe the codebase as it already is — STOR-01's endpoint-configurable
S3 client and the env-var config surface satisfy them by construction. That is the
point: the contract was written to lock in properties we already have, before
infrastructure exists that would tempt us out of them.

Docs-only change: no `apps/` files touched, so the test suite and build are
unaffected (last green: API 336/336, `turbo run lint typecheck build` 12/12 at
REP-04).

## Files

- `adr/ADR-006-ksa-cloud-provider.md` (rev. 5 note, current Decision + verification checklist, rev. 5 Consequences; rev. 1 sections retained as history)
- `adr/ADR-010-cloud-portability.md` (NEW)
- `adr/README.md` (index: ADR-006 rev. 5, ADR-010 Accepted)
- `docs/PROVISIONING-OCI.md` (rewritten — ACTIVE)
- `docs/PROVISIONING-AWS.md`, `docs/PROVISIONING-GCP-CNTXT.md` (superseded banners)
- `BACKLOG.md` (OCI epic + OCI-01 card; WS-20/21 repointed), `CLAUDE.md`

## Next — OCI-02 is yours, not mine

Account creation and credential entry are actions I must not perform. The next
step is the owner running `docs/PROVISIONING-OCI.md` §1–§4:

1. Sign up, **home region Riyadh** (cannot be changed later), MFA, subscribe Jeddah.
2. Service verification — open each Create screen, **create nothing**, record what
   is actually offered.
3. Budget alert.
4. API signing key + local `~/.oci/config` profile.

Then I fill the ADR-006 checklist from the observed values and start OCI-03.
