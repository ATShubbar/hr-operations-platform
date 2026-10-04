# Google Cloud provisioning runbook — UAT first, then production

Per **ADR-006 rev. 7** (Google Cloud, project `peoplegro-prod`, Cloud Run; **UAT in
`me-central1` Doha with sample data only**; production in the Kingdom, path open —
GCP-07) and **ADR-010** (portability; clause 1 excepted, clauses 2–6 in force).

> **Region:** UAT resources go in **`me-central1` (Doha)**. Cloud Run in `me-central2`
> (Dammam) is refused for this project ("Access to the region is unavailable") — see
> the status log and ADR-006 rev. 7.

**Who does what.** Steps marked **[owner]** need your Google login, a payment
decision or your DNS panel. You run them; I give the exact commands. Steps marked
**[me]** are commands I prepare. I run read-only ones freely, and anything that
**creates, changes or costs** only after you approve that specific step.

**Never in chat:** passwords, API keys, HMAC secrets, service-account JSON keys,
SMTP credentials. Secrets go into Secret Manager; when a value is needed, I show
you the command and you paste the value into **your own terminal**. We use **no
service-account key files at all**: GitHub deploys through Workload Identity
Federation (keyless).

---

## Environments and names

One project, two environments, kept apart by **prefix** and **service account**:

| Thing | UAT (now) | Production (later) |
|---|---|---|
| Address | `https://uat.peopleandgro.com` | `https://app.peopleandgro.com` |
| Region | **`me-central1` (Doha)** | in the Kingdom — **open (GCP-07)** |
| Data | **sample (seed) data only, never real people** | real data, after the PROD gates |
| Cloud Run services | `uat-api`, `uat-worker`, `uat-web` | `prod-api`, `prod-worker`, `prod-web` |
| Cloud Run job | `uat-migrate` | `prod-migrate` |
| Cloud SQL (Postgres **16**) | `uat-pg` | `prod-pg` |
| Memorystore (Redis) | `uat-redis` | `prod-redis` |
| Bucket | `peoplegro-uat-documents` | `peoplegro-prod-documents` |
| Secrets | `uat-*` | `prod-*` |
| Service accounts | `uat-run@…` (api / worker / web / migrate) | `prod-run@…` |
| Email | capture only: recorded in logs, never sent | real SMTP (PROD card) |

**Isolation rule:** a `uat-*` service account is granted access to `uat-*`
resources only. Nothing UAT runs as can read a `prod-*` secret, database or
bucket. This is weaker than separate projects, accepted in ADR-006 rev. 6.

**Shared:** the Artifact Registry repository `peoplegro` (images are the same for
both environments; an image is promoted, not rebuilt) and the GitHub deploy identity.

---

## GCP-02 — Tools and access [owner], then read-only checks [me]

### 1. Install the Google Cloud CLI on this Mac [owner]

Homebrew (if you use it):

```bash
brew install --cask google-cloud-sdk
```

Otherwise use Google's macOS installer:
https://cloud.google.com/sdk/docs/install#mac. Then open a **new** terminal.

### 2. Sign in and point at the project [owner]

```bash
gcloud auth login
```

A browser window opens; sign in with the Google account that owns `peoplegro-prod`.

```bash
gcloud config set project peoplegro-prod
```

```bash
gcloud config set run/region me-central1
```

(Updated after GCP-02: UAT runs in `me-central1`. If you already set `me-central2`, run
this once more — it just changes the default.)

### 3. Enable the services we will use [owner]

This turns on APIs. It costs nothing by itself (resources cost, APIs don't):

```bash
gcloud services enable run.googleapis.com sqladmin.googleapis.com redis.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com compute.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
```

### 4. Budget alert [owner, console]

Google Cloud console → **Billing** → **Budgets & alerts** → **Create budget** for
project `peoplegro-prod`, with alerts at 50 / 90 / 100 %. Pick an amount you are
comfortable with for the month (UAT alone should sit well under it; the real
figures come from the cost checks in GCP-03).

### 5. Tell me it's done → read-only checks [me]

I then run **read-only** commands only, and record the results in the status log:

- `gcloud config list` and `gcloud services list --enabled` confirm the project and APIs.
- Availability in `me-central2`, **seen, not assumed**:
  - Cloud Run;
  - Cloud SQL Postgres 16 and its smallest tiers;
  - Memorystore tiers;
  - whether Cloud Run **custom domain mappings** are offered in this region. If not, GCP-05 uses a small HTTPS load balancer.

---

## GCP-03 — UAT infrastructure [me, each step approved]

Before each **paid** resource I show its monthly price from your console
(Pricing / the creation page in `me-central2`) and wait for your yes.

1. **Artifact Registry**: Docker repository `peoplegro` in `me-central1`.
2. **Cloud SQL `uat-pg`**: PostgreSQL **16**, smallest tier, no HA (UAT), automatic backups on, database `hr_platform`.
   - **Migrations run as a user that can create roles.** They create `app_staff`, `app_client` and `app_employee`, so the migrator is a Cloud SQL built-in user (member of `cloudsqlsuperuser`).
   - **Rotate the role passwords immediately after the first migration.** Those roles are created with development passwords (`app_*_dev_pw`), so each gets a new password with `ALTER ROLE … PASSWORD …`. **You type the new passwords into your terminal; they are never pasted into chat.**
3. **Memorystore `uat-redis`**: the smallest Basic tier, on the default VPC. Cloud Run reaches it through **Direct VPC egress**.
4. **Bucket `peoplegro-uat-documents`**:
   - uniform access, no public access;
   - **CORS** allowing `https://uat.peopleandgro.com` for the browser's direct PUT/GET (DOC-05);
   - an **HMAC key** for the S3-compatible API (ADR-010 clause 3). The secret goes straight into Secret Manager.
5. **Secrets** (Secret Manager, `uat-*`): `DATABASE_URL`, `STAFF_DATABASE_URL`, `CLIENT_DATABASE_URL`, `EMPLOYEE_DATABASE_URL`, `REDIS_URL`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`.
6. **Plain environment variables** (not secret):
   - `STORAGE_ENDPOINT=https://storage.googleapis.com`
   - `STORAGE_REGION=me-central1`
   - `STORAGE_BUCKET=peoplegro-uat-documents`
   - `APP_WEB_ORIGIN=https://uat.peopleandgro.com`
   - `NODE_ENV=production`
   - `BUILD_VERSION=<git sha>`
   - on `uat-web`: `API_PROXY_TARGET=<uat-api internal URL>`
7. **Service account `uat-run`**: roles only on `uat-*`. That means Cloud SQL Client, Secret Accessor on `uat-*` secrets, Storage Object Admin on the UAT bucket only, and Artifact Registry Reader.

The app reads all of this as **environment variables**. It never calls a Google
SDK (ADR-010 clauses 5 and 6). Cloud Run injects secret values at deploy time.

---

## GCP-04 — Images and the deploy pipeline [me]

- **Code change: split the worker from the API.** Today `MainModule` runs the HTTP app and the BullMQ worker in one process. Cloud Run needs them apart:
  - **`uat-api`**: the HTTP app, no worker; scales with requests.
  - **`uat-worker`**: the worker, **min instances 1, CPU always allocated**, no public ingress. Without this the email dispatch and the daily 06:00 expiry scan would silently not run.

  Same image, different start command.
- **The app listens on `PORT`** (Cloud Run sets it; the API already reads `process.env.PORT`).
- **GitHub Actions**, keyless through **Workload Identity Federation** (a pool trusting only this repository). On a push to `main`, after the existing checks pass:
  1. build the `api` (runtime + migrate targets) and `web` images;
  2. push them to `peoplegro`;
  3. run the **`uat-migrate`** job;
  4. deploy `uat-api`, `uat-worker` and `uat-web`;
  5. check `/health`.
- The dead AWS deploy job in `.github/workflows/ci.yml` is replaced, and `infra/ecs/` is removed.

---

## GCP-05 — `uat.peopleandgro.com` [me + owner] — DONE

- **Cloud Run domain mapping is refused in Doha**: the API lists mappings in `me-central1`, but creating one
  answers `501 Creating domain mappings is not allowed in me-central1` (a dry run, so nothing was made). So UAT uses
  a **global external HTTPS load balancer** (≈ $18.25/mo, owner-approved): static IP `uat-web-ip` (34.117.197.43),
  serverless NEG `uat-web-neg` → `uat-web`, backend `uat-web-backend`, URL map `uat-web-map`, Google-managed
  certificate, HTTPS proxy + forwarding rule on 443, and a redirect-only URL map + proxy + rule on 80.
- **Do not pass `--protocol=HTTPS` to the backend service** — gcloud then sets port name `https`, which a serverless
  NEG rejects (`Port name is not supported`). The default (port name `http`) is what Google's own example uses.
- **DNS at Hostinger [owner]:** an `A` record `uat` → the load balancer's IP, plus a `TXT` `google-site-verification`
  at `@` (Search Console; it stays, and covers `app.` later). **Hostinger kept serving a deleted record** for about
  1.5 hours after the panel no longer showed it — its nameservers disagreed about the zone version (`…04` vs `…06`).
  Support purged it. A Google-managed certificate fails (`FAILED_NOT_VISIBLE`) while that happens; replacing the
  certificate (free: create new → swap on the proxy → delete old) starts a fresh attempt.
- The session cookie is `secure` in production, so sign-in **only** works over HTTPS.

---

## GCP-06 — Sample data and smoke test [me + owner]

- **Never with the repository's dev password** — the repository is public. The seed reads `SEED_PASSWORD` from the
  owner-generated secret `uat-seed-password`, and `prisma/seed-guard.ts` refuses production mode without
  `SEED_TARGET=uat` and that password. The real production never gets either.
- **Run it:** GitHub → Actions → **Seed UAT** → Run workflow (`main`; `seed-and-smoke` resets UAT to the scenario,
  `smoke-only` just checks). Jobs `uat-seed` and `uat-smoke` run as service account `uat-seed` (Cloud SQL `uat-*`
  only; reads `uat-database-url` + `uat-seed-password`; registry reader). SEED-01: it also reads
  `uat-storage-access-key` + `uat-storage-secret-key` (the app's HMAC key) so the seed can write the files
  behind its documents and sample attachments; the bucket settings come from `uat-env.yaml`.
- **The smoke check** (`apps/api/scripts/uat-smoke.mjs`) signs in as HR officer, GRO officer, client manager and
  employee through the public address; one allowed + one refused route each; a document round-trip through the
  bucket; and a request whose notification the **worker** must email (find `email → client_manager-a@…` in the
  `uat-worker` log).
- **UAT-01 (owner decision):** UAT accounts are `admin@` / `hr@` / `gro@` / `auditor@` / `client@` /
  `employee@peopleandgro.com` (+ `admin2@`, `hr2@`, `hr3@`, `client2@`), all with the secret's password, and **no
  authenticator** — `UAT_DISABLE_MFA=true` in `uat-env.yaml`, honoured only on the UAT origin (ADR-013 rev. 2). The
  smoke check (`SMOKE_ACCOUNTS=uat`) therefore covers all six roles.

---

## PROD-* — Production at `app.peopleandgro.com` (later, separate cards)

These gates are not optional before real people's data goes in:

- real SMTP sender and DNS (SPF/DKIM) at Hostinger;
- Cloud SQL HA and backups, with **a restore actually performed** (the WS-21 / ADR-010 exit drill);
- the seed never runs on production;
- the first Administrator created by hand, with **two-factor enrolled**;
- monitoring and alerting;
- `prod-*` resources and service account;
- the `app` DNS record;
- the session-ending check after the role migration landmine (CLAUDE.md).

---

## Cost checks (filled in as we go)

Prices read from Google's **Cloud Billing Catalog** (official SKUs, `me-central1`, USD), 730 h/month:

| Date | Resource | Tier / size | Unit prices (Doha) | ≈ / month | Approved |
|---|---|---|---|---|---|
| 2026-10-04 | Artifact Registry `peoplegro` + `dockerhub` (remote proxy) | ~1–2 GB images | in-region pulls free | < $0.50 | owner, 2026-10-04 |
| 2026-10-04 | Cloud SQL `uat-pg` | PG16 Enterprise, Zonal **Micro**, 10 GiB SSD, 7 backups | $0.012757/h · $0.2066/GiB-mo · backups $0.0972/GiB-mo | ≈ $12 | owner, 2026-10-04 |
| 2026-10-04 | VM `uat-redis` | e2-micro (0.25 vCPU, 1 GiB) + 10 GB pd-standard, **no public IP** | core $0.026501/h · RAM $0.003552/GiB-h · disk $0.0486/GB-mo | ≈ $8 | owner, 2026-10-04 |
| 2026-10-04 | Bucket `peoplegro-uat-documents` | Standard | $0.023/GiB-mo | < $0.10 | owner, 2026-10-04 |
| 2026-10-04 | Secret Manager (2 secrets so far) | — | $0.06/secret-mo | ≈ $0.12 | owner, 2026-10-04 |
| (GCP-04) | Cloud Run **worker pool** `uat-worker` | 1 vCPU, 512 MiB, always on | $0.000013/vCPU-s | ≈ $36 | running |
| (GCP-04) | Cloud Run `uat-api`, `uat-web` | scale to zero | per request | pennies | running |
| (GCP-05) | Global HTTPS load balancer (forwarding-rule minimum, global) | 2 rules (443 + 80 redirect) | $0.025/h minimum covers up to 5 rules; data processing ~$0.01/GB | ≈ $18.25 | running |
| (GCP-06) | Cloud Run jobs `uat-seed`, `uat-smoke` | run on demand, ~30 s each | per second | pennies | on demand |
| | **UAT total** | | | **≈ $75** | |

## Status log

| Date | Step | Result |
|---|---|---|
| 2026-09 | Owner created `peoplegro-prod`; saw Cloud SQL (PG 16/18), GKE, Memorystore, buckets + HMAC, Artifact Registry, WIF in `me-central2` | recorded in ADR-006 rev. 6 |
| 2026-10-04 | GCP-01: ADR-006 rev. 6 + this runbook | written |
| 2026-10-04 | GCP-02 [owner]: gcloud 587.0.0 installed (Homebrew), signed in as the project owner, project + region set, 9 APIs enabled, budget created | done |
| 2026-10-04 | GCP-02 [me] read-only: config OK; APIs enabled; billing enabled; project ACTIVE under an organization; org policy `gcp.resourceLocations` = allow all | OK |
| 2026-10-04 | `me-central2`: Compute zones UP, CPU quota 72; Cloud SQL tiers incl. db-f1-micro listed; PG16 recognised; Memorystore + Artifact Registry list | listed (creation untested) |
| 2026-10-04 | **`me-central2`: Cloud Run services / jobs / domain mappings → "Access to the region is unavailable. Please contact our sales team"** | **BLOCKED** |
| 2026-10-04 | Cloud Run in `me-central1` (Doha) and `europe-west1` | open |
| 2026-10-04 | Owner decision: UAT in `me-central1`, sample data only (ADR-006 rev. 7) | decided |
| 2026-10-04 | GCP-03: Cloud Billing API enabled (owner-approved, free) to read official prices | done |
| 2026-10-04 | GCP-03: Artifact Registry `peoplegro` (standard) + `dockerhub` (Docker Hub remote proxy), `me-central1` | created |
| 2026-10-04 | GCP-03: service accounts `uat-run`, `uat-redis-vm`; repository-scoped `artifactregistry.reader` only | created |
| 2026-10-04 | GCP-03: bucket `peoplegro-uat-documents` (ME-CENTRAL1, uniform access, public access prevention enforced, CORS `https://uat.peopleandgro.com` GET/PUT/HEAD); `uat-run` objectAdmin on this bucket only | created |
| 2026-10-04 | GCP-03: Cloud SQL `uat-pg` (POSTGRES_16, ENTERPRISE, db-f1-micro, ZONAL, 10 GiB SSD, auto-resize OFF, 7 backups, deletion protection ON, no authorized networks, **sslMode ENCRYPTED_ONLY**); database `hr_platform`; connection `peoplegro-prod:me-central1:uat-pg` | created |
| 2026-10-04 | GCP-03: Private Google Access ON for subnet `default` (me-central1, 10.212.0.0/20) | done |
| 2026-10-04 | GCP-03: secrets `uat-redis-password`, `uat-db-migrator-password` (me-central1 only); **values generated by the owner** (`openssl rand -hex 32` piped in — never displayed) | created |
| 2026-10-04 | GCP-03: VM `uat-redis` (e2-micro, COS, me-central1-a, 10.212.0.2, **no external IP**, Shielded VM); startup script `infra/gcp/uat-redis-startup.sh` exit 0, Redis 7 pulled via the private proxy | running |
| 2026-10-04 | GCP-03: **owner** created DB user `migrator` from the secret (cloudsqlsuperuser) | done |
| 2026-10-04 | GCP-03 check: no `uat-*` account holds a project-level role; grants are resource-scoped only | verified |
| 2026-10-04 | Note for PROD: the default network's `default-allow-ssh` / `default-allow-rdp` rules are open to 0.0.0.0/0 (harmless to IP-less VMs, but tighten before production) | open |
| 2026-10-04 | Note: `gcloud` needs Python ≥ 3.10. macOS's built-in 3.9 fails; Homebrew's `python3.14` works (`CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.14`) | — |
| 2026-10-04 | GCP-04: `deploy-uat` (WIF, no key files) built + pushed `api`/`migrate`/`web-uat`, ran `uat-migrate` (role passwords set), deployed `uat-api` (internal), worker pool `uat-worker`, `uat-web` (public) | running |
| 2026-10-04 | GCP-04 check: `https://uat-web-1048926106506.me-central1.run.app/api/health` 200 with the commit, `/api/ready` 200; `uat-api` direct → 404 | verified |
| 2026-10-04 | GCP-04: worker `NOAUTH` from Redis (queue connection dropped the URL's password) → fixed in `2049886`; 0 worker log lines after the switchover | fixed |
| 2026-10-04 | GCP-05: owner verified `peopleandgro.com` in Search Console (TXT at `@`) | verified |
| 2026-10-04 | GCP-05: domain mapping dry run in `me-central1` → **501 not allowed** | blocked |
| 2026-10-04 | GCP-05: global HTTPS load balancer for `uat-web` (owner-approved ≈ $18.25/mo), IP 34.117.197.43; HTTP → 301 HTTPS | running |
| 2026-10-04 | GCP-05: Hostinger served a deleted `uat` CNAME for ~1.5 h (zone `…04` vs `…06` across its nameservers); support purged it; two certificates failed `FAILED_NOT_VISIBLE`, the third went ACTIVE at 15:55 (+04) | done |
| 2026-10-04 | GCP-05 check: `https://uat.peopleandgro.com` — Google Trust Services WR3 cert, valid to 2027-01-02, health/ready/login 200 | verified |
| 2026-10-04 | GCP-06: owner created `uat-seed-password` (me-central1, never displayed); service account `uat-seed` | created |
| 2026-10-04 | GCP-06: Seed UAT run — seed 5 clients / 39 employees / 20 documents / 10 accounts (6/6 roles); smoke **25/25**; worker emailed `client_manager-a` 2 s after the request moved | verified |
| 2026-10-04 | UAT-01: owner set `uat-seed-password` v2; `3354ed0` deployed (`UAT_DISABLE_MFA=true` on api + worker); re-seeded → @peopleandgro.com accounts; smoke **33/33** incl. Administrator + Auditor without an authenticator | verified |
| 2026-10-04 | SEED-01 (owner-approved): `uat-seed` granted `roles/secretmanager.secretAccessor` on `uat-storage-access-key` and `uat-storage-secret-key` — two bindings, nothing created, no cost | done |
| 2026-10-04 | SEED-01: Seed UAT run — 20 documents with files + 2 request files written to `peoplegro-uat-documents`; smoke **46/46** incl. a seeded document and attachment downloading as PDFs | verified |
