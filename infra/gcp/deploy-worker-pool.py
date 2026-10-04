#!/usr/bin/env python3
"""Create or update the UAT worker pool `uat-worker` (GCP-04).

The BullMQ workers (email dispatch, the daily expiry scan) need a process that
never sleeps; a Cloud Run worker pool is that, billed per instance-second. It
runs the SAME image as uat-api with `node dist/worker.js` (no HTTP port).

Deployed through the Cloud Run v2 REST API (PATCH ...?allowMissing=true = create
or update), whose WorkerPool schema supports the Cloud SQL volume and Direct VPC
egress this needs. Environment and secrets come from uat-env.yaml and
uat-runtime-secrets.txt — the same files the uat-api deploy reads.

Usage: deploy-worker-pool.py IMAGE BUILD_VERSION [--validate-only]
Auth:  `gcloud auth print-access-token` (the caller's identity).
"""
import json
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "peoplegro-prod"
REGION = "me-central1"
POOL = "uat-worker"
SQL = f"{PROJECT}:{REGION}:uat-pg"
HERE = pathlib.Path(__file__).parent


def plain_env():
    out = []
    for line in (HERE / "uat-env.yaml").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        k, v = line.split(":", 1)
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]  # a quoted YAML scalar, e.g. "true"
        out.append({"name": k.strip(), "value": v})
    return out


def secret_env():
    out = []
    for line in (HERE / "uat-runtime-secrets.txt").read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        name, ref = line.split("=", 1)
        secret, version = ref.split(":", 1)
        out.append({"name": name, "valueSource": {"secretKeyRef": {"secret": secret, "version": version}}})
    return out


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    image, build = sys.argv[1], sys.argv[2]
    validate = "--validate-only" in sys.argv
    env = plain_env() + [{"name": "BUILD_VERSION", "value": build}] + secret_env()
    body = {
        "labels": {"env": "uat"},
        "launchStage": "BETA",
        "scaling": {"manualInstanceCount": 1},
        "template": {
            "labels": {"env": "uat"},
            "serviceAccount": f"uat-run@{PROJECT}.iam.gserviceaccount.com",
            "vpcAccess": {
                "networkInterfaces": [{"network": "default", "subnetwork": "default"}],
                "egress": "PRIVATE_RANGES_ONLY",
            },
            "volumes": [{"name": "cloudsql", "cloudSqlInstance": {"instances": [SQL]}}],
            "containers": [
                {
                    "image": image,
                    "command": ["node"],
                    "args": ["dist/worker.js"],
                    "resources": {"limits": {"cpu": "1", "memory": "512Mi"}},
                    "env": env,
                    "volumeMounts": [{"name": "cloudsql", "mountPath": "/cloudsql"}],
                }
            ],
        },
    }
    token = subprocess.run(
        ["gcloud", "auth", "print-access-token"], check=True, capture_output=True, text=True
    ).stdout.strip()
    url = (
        f"https://run.googleapis.com/v2/projects/{PROJECT}/locations/{REGION}/workerPools/{POOL}"
        f"?allowMissing=true{'&validateOnly=true' if validate else ''}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        method="PATCH",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            op = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"worker pool {'validation' if validate else 'deploy'} failed: {e.code} {e.read().decode()[:2000]}")
    print(("validated" if validate else "submitted") + f": {op.get('name', '')}")


if __name__ == "__main__":
    main()
