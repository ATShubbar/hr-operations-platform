# GCP-05 — `uat.peopleandgro.com` — Evidence

- Date: 2026-10-04
- Task card: `BACKLOG.md` → GCP-05; runbook `docs/PROVISIONING-GCP.md` (GCP-05 section, cost table, status log)
- Status: **done**. UAT answers at **https://uat.peopleandgro.com**. No application code changed.

## Decisions (owner)

| What | Decision |
|---|---|
| How the domain reaches UAT | Cloud Run **domain mapping** (free) — chosen first |
| After Doha refused domain mappings | A **global external HTTPS load balancer** at ≈ $18.25/month (official price below) — approved |
| DNS | Stays at Hostinger; the owner adds the records |

## What Google allowed, and what it refused

- **Domain mapping refused.** Listing mappings in `me-central1` works, but a **dry-run** create (`?dryRun=all`, so nothing was created) answered:
  `{'code': 501, 'message': 'Creating domain mappings is not allowed in me-central1.', 'status': 'UNIMPLEMENTED'}`.
  In `me-central2`, even listing is refused (`LOCATION_POLICY_VIOLATED`).
- **Price**, from the official Cloud Billing Catalog (Networking service):
  - `Cloud Load Balancer Forwarding Rule Minimum Global`: $0.025/hour, so ≈ $18.25/month. The minimum covers both of our rules.
  - The catalog has no separate line for the IP address of a forwarding rule; its only IP charges are for VMs.

## Created (all `uat-web-*`, global unless noted)

| Resource | Detail |
|---|---|
| `uat-web-ip` | static IPv4 **34.117.197.43** |
| `uat-web-neg` | serverless NEG, `me-central1`, pointing at Cloud Run `uat-web` |
| `uat-web-backend` | EXTERNAL_MANAGED. My first `--protocol=HTTPS` set port name `https`, which serverless NEGs reject. Fixed by letting the API default it (`http`, as in Google's example). |
| `uat-web-map` → `uat-web-https` → `uat-web-https-fr` | HTTPS on port 443 |
| `uat-web-redirect` → `uat-web-http` → `uat-web-http-fr` | port 80, `301` to HTTPS |
| `uat-web-cert-3` | Google-managed certificate for `uat.peopleandgro.com` (attempts `-cert`, `-cert-2` deleted) |

## DNS (owner, at Hostinger)

- **Search Console:** the owner verified `peopleandgro.com` with a TXT record at `@`. `gcloud domains list-user-verified` then listed `peopleandgro.com`. The record stays; production reuses it.
- **Records:**
  - first a CNAME `uat` → `ghs.googlehosted.com.`, for the domain mapping;
  - then **deleted**, and replaced by an A record `uat` → `34.117.197.43`.
- **Hostinger kept serving the deleted CNAME.**
  - Both nameservers returned A and CNAME from the same zone version (`2026100404`).
  - Google's resolver followed the CNAME at times, and the first certificate failed with `FAILED_NOT_VISIBLE`.
  - Hostinger support purged it. Their first reply said the purge was verified, then corrected itself: they'd checked the saved zone, not the live nameservers.
  - The new version (`2026100406`) took time to reach all their nameservers: over a few minutes, 18–20 of 20 answers were still stale.
  - By 15:4x every relevant query type was clean:
    - A: 20/20 → `34.117.197.43`;
    - CNAME, AAAA and CAA: 0/20;
    - Google Public DNS: A only, no CNAME.
  - The second certificate had already failed in the meantime, so a third was created; it went **ACTIVE at 15:55 (+04)**.

## Verification

```
subject= /CN=uat.peopleandgro.com
issuer= /C=US/O=Google Trust Services/CN=WR3
notBefore=Oct  4 10:54:51 2026 GMT
notAfter=Jan  2 11:48:04 2027 GMT          (Google renews managed certificates itself)
SSL certificate verify ok.

http://uat.peopleandgro.com/en/login -> 301 https://uat.peopleandgro.com:443/en/login
https://uat.peopleandgro.com/api/health -> 200 {"status":"ok","service":"hr-api","version":"2a3601d…"}
https://uat.peopleandgro.com/api/ready  -> 200
https://uat.peopleandgro.com/en/login   -> 200   <title>PEOPLE&amp;GRO</title>
https://uat.peopleandgro.com/ar/login   -> 200
https://uat-web-1048926106506.me-central1.run.app/api/health -> 200 (still works; CI's health gate uses it)
```

## Notes

- UAT now costs ≈ $75/month: the worker pool ≈ $36, the load balancer ≈ $18.25, Cloud SQL ≈ $12, the Redis VM ≈ $8, the rest pennies.
- Production will also need a load balancer (or a domain mapping, if production's region allows one). `peopleandgro.com` is already verified for it.
