#!/bin/bash
# UAT Redis VM startup (GCP-03). Runs on every boot of `uat-redis` (Container-
# Optimized OS, e2-micro, NO public IP). It:
#   1. reads the Redis password from Secret Manager (`uat-redis-password`) with
#      the VM's own service account — the password is written to a root-only
#      config file on the VM, never into the VM's metadata or a command line;
#   2. pulls Redis through our Artifact Registry Docker Hub proxy (`dockerhub`)
#      over Private Google Access;
#   3. runs Redis with no persistence (sessions + queues only; Redis is never
#      the only copy of data — ADR-010 clause 4) and `noeviction`, which BullMQ
#      requires so queued jobs are never silently evicted.
set -euo pipefail

PROJECT=peoplegro-prod
SECRET=uat-redis-password
IMAGE=me-central1-docker.pkg.dev/${PROJECT}/dockerhub/library/redis:7-alpine
CONF_DIR=/var/lib/uat-redis
META=http://metadata.google.internal/computeMetadata/v1

TOKEN=$(curl -sf -H 'Metadata-Flavor: Google' "${META}/instance/service-accounts/default/token" \
  | sed -n 's/.*"access_token" *: *"\([^"]*\)".*/\1/p')

DATA=$(curl -sf -H "Authorization: Bearer ${TOKEN}" \
  "https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${SECRET}/versions/latest:access" \
  | sed -n 's/.*"data" *: *"\([^"]*\)".*/\1/p')

mkdir -p "${CONF_DIR}"
chmod 700 "${CONF_DIR}"
umask 077
{
  echo "requirepass $(echo "${DATA}" | base64 -d)"
  echo 'save ""'
  echo 'appendonly no'
  echo 'maxmemory 400mb'
  echo 'maxmemory-policy noeviction'
  echo 'protected-mode no'
} > "${CONF_DIR}/redis.conf"
# The container's redis user must read the file; it stays inside a 700 dir.
chmod 644 "${CONF_DIR}/redis.conf"

export HOME=/var/lib/uat-redis-home
mkdir -p "${HOME}"
docker-credential-gcr configure-docker --registries=me-central1-docker.pkg.dev

docker rm -f redis >/dev/null 2>&1 || true
docker run -d --name redis --restart=always -p 6379:6379 \
  -v "${CONF_DIR}/redis.conf:/usr/local/etc/redis/redis.conf:ro" \
  "${IMAGE}" redis-server /usr/local/etc/redis/redis.conf
