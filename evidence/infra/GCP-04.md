# GCP-04 — Worker split + keyless deploy of UAT to Cloud Run (`me-central1`) — Evidence

- Date: 2026-10-04
- Task card: `BACKLOG.md` → GCP-04; runbook `docs/PROVISIONING-GCP.md` (status log + cost table)
- Decisions: ADR-006 rev. 7 (UAT in Doha, **sample data only**); ADR-010 clause-1 exception (Cloud Run)
- Status: **done.** The app runs on Google's address. The custom domain is GCP-05; sample data and the per-role smoke test are GCP-06.

## Commits

| Commit | What |
|---|---|
| `da4c921` | Part A. `src/http.ts` (API only, no workers) and `src/worker.ts` (the BullMQ worker, no port), built from one image. `prisma/deploy.sh` runs the migrations, then sets the `app_staff` / `app_client` / `app_employee` passwords from secrets (hex only, else exit 1). The dead AWS job and `infra/ecs/` are removed. |
| `db47e2a` | Part B. The `deploy-uat` job: Workload Identity Federation → build and push `api` / `migrate` / `web-uat` → run the migrate job → deploy `uat-api` (internal) → deploy the worker pool (`infra/gcp/deploy-worker-pool.py`, REST v2) → deploy `uat-web` (public) → health gate. |
| `16c5428`, `a35a918` | **CI had been red for 30+ commits, unseen until a deploy depended on it.** Three specs need the seed, so CI now seeds. The seed needs the workspace packages built first (`MODULE_NOT_FOUND @hr/contracts/dist`, reproduced locally). |
| `f9caa9f`, `8469515` | **CI had no object storage.** The document specs had returned 500 on upload. And **MinIO no longer publishes images**: `minio/minio` on Docker Hub reports "repository does not exist", and Quay returns 401. CI now uses `bitnamilegacy/minio`, pinned by its multi-arch digest (amd64 + arm64). Locally, against that image: the six storage specs pass 43/43, and the objects were confirmed written to that instance. |
| `2049886` | **The worker couldn't authenticate to Redis.** `redisConnection()` kept only host and port from `REDIS_URL`. The session store takes the URL whole, so `/api/ready` passed while the worker logged `NOAUTH Authentication required`. It now keeps username, password (URL-decoded) and the database number. The spec was **red 2 of 3 before the fix**, then green; the existing queue spec still passes. |

## The pipeline deploys on push, unattended

Three pushes deployed themselves (`8469515`, `2049886`), each CI-gated: `deploy-uat` needs `ci`, and runs on pushes to `main` only.

- Images in `me-central1-docker.pkg.dev/peoplegro-prod/peoplegro`: `api`, `migrate` and `web-uat`, each tagged with the commit hash.
- Migrate job executions (`uat-migrate`): `uat-migrate-fwt76` succeeded at 09:31:40Z, and `uat-migrate-hhxp7` succeeded at 10:03:08Z.
- The **role passwords were replaced**:
  - the API's runtime secrets hold **only** the `app_*` URLs, composed from the owner-generated passwords;
  - the API has no `DATABASE_URL`;
  - `/api/ready` is 200, so `app_staff` signs in with the new password. The development password is not in any secret.

## Deployed state (read back)

| Resource | State |
|---|---|
| `uat-api` | ingress **internal**, max 2 instances, runs as `uat-run`, image `api:2049886…`, Ready |
| `uat-web` | ingress **all**, max 2 instances, runs as `uat-web` (no permissions), image `web-uat:2049886…`, Ready |
| Worker pool `uat-worker` | image `api:2049886…`, `manualInstanceCount: 1`, condition `Ready / CONDITION_SUCCEEDED` |

## Through the public address

```
https://uat-web-1048926106506.me-central1.run.app
/api/health -> 200 {"status":"ok","service":"hr-api","version":"20498868a5f31af99721078d8abc467b4d176595",…}
/api/ready  -> 200 {"status":"ready"}
/ar/login   -> 200
uat-api run.app address directly -> 404 (internal ingress: not reachable from the internet)
```

## The worker

- **Before `2049886`:** 152 `NOAUTH` log lines in 20 minutes. The last one was at 10:03:54Z, as the old instance drained; the update applied at 10:03:36Z.
- **After:** **0 log lines of any kind** from 10:03:56Z to 10:07:18Z (checked after three minutes).
- **Not yet proven:** that the worker *processes* a job. That needs a real job, such as an account email sent through the capture transport. It is part of **GCP-06's** smoke test, where there are users to act as.

## Notes and follow-ups

- **Local stack:** `docker-compose.yml` still names `minio/minio`. It works only where the image is already cached. Filed as a separate task to move it to the same pinned image.
- **GitHub's anonymous API allows 60 requests an hour.** A watcher polling three endpoints every 45 seconds ran out mid-run. Poll the Google side instead, or poll GitHub rarely.
- Cost is unchanged from GCP-03's table: UAT ≈ $57/month, of which the always-on worker pool is ≈ $36.
