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

## GCP-05 — `uat.peopleandgro.com` [me + owner]

- If Cloud Run **domain mapping** exists in `me-central2` (checked in GCP-02): map `uat.peopleandgro.com` to `uat-web`. Google issues the HTTPS certificate.
- Otherwise: a small **global external HTTPS load balancer** with a serverless NEG in front of `uat-web`, plus a Google-managed certificate.
- **DNS at Hostinger [owner]:** hPanel → **Domains** → `peopleandgro.com` → **DNS / Nameservers** → **DNS records** → add the record I give you. For a domain mapping that's a `CNAME` with name `uat` pointing to `ghs.googlehosted.com.`; for a load balancer it's an `A` record with name `uat` and the load balancer's IP. The certificate becomes active once DNS resolves, which can take up to a few hours.
- The session cookie is `secure` in production, so sign-in **only** works over HTTPS. That's why the domain must exist before UAT is usable.

---

## GCP-06 — Sample data and smoke test [me]

- Load the **seed** (`pnpm --filter @hr/api db:seed` against `uat-pg`, through the migrate job's image).
- Smoke-test at `https://uat.peopleandgro.com`, signing in as **each role** with the seed accounts (password from the seed file):
  - Overview, People, a person record, Requests, Work queue, Calendar, Clients, Reports, Audit, Settings;
  - the client-manager Overview;
  - the employee's My file;
  - a document upload and download (proves the bucket CORS and HMAC setup).
- Confirm the worker runs: queue a notification and see it delivered in-app.
- Evidence file, then UAT is **live**.

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

| Date | Resource | Tier / size | Monthly price seen in console | Approved |
|---|---|---|---|---|
| | | | | |

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
| 2026-10-04 | Note: `gcloud` needs Python ≥ 3.10. macOS's built-in 3.9 fails; Homebrew's `python3.14` works (`CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.14`) | — |
