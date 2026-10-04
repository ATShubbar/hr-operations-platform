#!/bin/sh
# UAT secrets, filled in ONE run by the project owner (GCP-04 part B).
#
# Run from your own terminal, signed in as the project owner:
#     sh infra/gcp/uat-secrets.sh
#
# What it does — and what it never does:
#   - It NEVER prints a secret value. Every value goes from one command straight
#     into Secret Manager through a pipe; nothing is written to disk.
#   - Role passwords (app_staff / app_client / app_employee) are generated ONLY
#     if that secret has no version yet, so re-running never rotates them by
#     accident. They are hex, so they need no escaping in URLs or SQL.
#   - The connection URLs are (re)composed from the passwords already stored.
#     They point at the Cloud SQL unix socket Cloud Run mounts, and at the Redis
#     VM's private address.
#   - The bucket's HMAC key (S3-compatible API, ADR-010 clause 3) is created for
#     the `uat-run` service account ONLY if `uat-storage-access-key` has no
#     version yet.
#
# The secrets themselves were created (empty) by GCP-04; this only adds versions.
set -eu

PROJECT=peoplegro-prod
SOCKET=/cloudsql/${PROJECT}:me-central1:uat-pg
REDIS_HOST=10.212.0.2
RUN_SA=uat-run@${PROJECT}.iam.gserviceaccount.com

has_version() {
  [ -n "$(gcloud secrets versions list "$1" --project="$PROJECT" --limit=1 --format='value(name)')" ]
}
put() { # put SECRET — reads the value from stdin
  gcloud secrets versions add "$1" --project="$PROJECT" --data-file=- >/dev/null
  echo "  stored: $1"
}
get() { gcloud secrets versions access latest --secret="$1" --project="$PROJECT"; }

echo "1/4 role passwords"
for s in uat-db-app-staff-password uat-db-app-client-password uat-db-app-employee-password; do
  if has_version "$s"; then
    echo "  kept:   $s (already set)"
  else
    openssl rand -hex 32 | tr -d '\n' | put "$s"
  fi
done

echo "2/4 database URLs (via the Cloud SQL socket)"
url() { printf 'postgresql://%s:%s@localhost/hr_platform?host=%s' "$1" "$2" "$SOCKET"; }
url migrator "$(get uat-db-migrator-password)" | put uat-database-url
url app_staff "$(get uat-db-app-staff-password)" | put uat-staff-database-url
url app_client "$(get uat-db-app-client-password)" | put uat-client-database-url
url app_employee "$(get uat-db-app-employee-password)" | put uat-employee-database-url

echo "3/4 Redis URL (the VM's private address)"
printf 'redis://:%s@%s:6379' "$(get uat-redis-password)" "$REDIS_HOST" | put uat-redis-url

echo "4/4 bucket HMAC key for $RUN_SA"
if has_version uat-storage-access-key; then
  echo "  kept:   uat-storage-access-key / uat-storage-secret-key (already set)"
else
  gcloud storage hmac create "$RUN_SA" --project="$PROJECT" --format=json | python3 -c '
import json, subprocess, sys

def find(o, key):
    if isinstance(o, dict):
        if key in o and isinstance(o[key], str):
            return o[key]
        for v in o.values():
            r = find(v, key)
            if r:
                return r
    return None

d = json.load(sys.stdin)
access, secret = find(d, "accessId"), find(d, "secret")
if not access or not secret:
    sys.exit("could not read the new HMAC key from gcloud output; nothing stored")
for name, value in (("uat-storage-access-key", access), ("uat-storage-secret-key", secret)):
    subprocess.run(["gcloud", "secrets", "versions", "add", name, "--project=peoplegro-prod",
                    "--data-file=-"], input=value.encode(), check=True, stdout=subprocess.DEVNULL)
    print("  stored: " + name)
'
fi

echo "done — no values were displayed."
