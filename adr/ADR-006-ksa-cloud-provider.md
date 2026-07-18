# ADR-006 — KSA cloud provider selection

- Status: Open (evaluation not complete — decision required before walking skeleton deploy)
- Date: 2026-07-18
- Owner: TBD

## Context
All production data, backups, and logs must remain in Saudi Arabia (PDPL/residency principle). The provider choice determines whether we get **managed** PostgreSQL, Redis, and S3-compatible storage — or operate our own stateful services in Docker, which is a major hidden cost and reliability risk for a small team. It also determines pooler behavior relevant to ADR-001.

## Options considered (to be completed during evaluation)
1. **Google Cloud — Dammam region.** Mature managed services (Cloud SQL, Memorystore, GCS); verify service availability in-region.
2. **Oracle Cloud — Riyadh/Jeddah.** In-Kingdom regions; verify managed Postgres/Redis parity and object storage S3-compatibility.
3. **STC Cloud / local providers.** Strong residency posture; verify managed-service depth vs. raw VMs.
4. **AWS / Azure KSA regions.** Confirm current in-Kingdom region availability and service coverage at evaluation time.

Evaluation criteria (in order): managed PostgreSQL with HA + automated backups in-region → managed Redis → S3-compatible storage in-region → connection pooling options (relevant to SPIKE-001) → egress/network posture → cost → support.

## Decision
Pending. The decision must be recorded here with the criteria table filled in, plus the chosen region, RPO/RTO targets, and backup schedule.

## Consequences (expected regardless of choice)
- If managed Postgres is unavailable on the chosen provider, self-operating the database becomes its own ADR with an on-call and backup-testing plan — treat this as a strong argument against that provider.
- SPIKE-001's S4 benchmark should run on infrastructure equivalent to the chosen provider.
- Backup restore testing (walking skeleton DoD 1.7) is part of accepting this ADR, not a later task.

## Links
- `architecture.md` — Infrastructure, Compliance & Security Baseline
- ADR-001 (pooler interaction), `ACTION-PLAN.md` 0.6, 1.7
