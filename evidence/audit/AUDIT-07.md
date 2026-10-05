# AUDIT-07 — export the audit trail, and grade every entry by severity

**Owner decisions (2026-10-05):**
- Scope: Export and severity together.
- Who exports: Administrator and Auditor.
- Values: **full before/after values** in the file. The owner chose this over "field names only".
- The severity table was approved as proposed.

## What changed

| Layer | Change |
|---|---|
| Catalog | New capability `audit.export`, granted to administrator and auditor. architecture.md's catalog row and the matrix row (`R + export`) are updated, and `role-matrix.e2e-spec.ts` pins it. The Auditor's "changes nothing" check lists `audit.export` as a named exception, with the reason. `report.export` stays refused for the Auditor. |
| Severity | `modules/audit/domain/severity.ts` holds ONE table. Severity is **derived** from the record type and action, never stored, so editing a row re-grades the whole trail. **Critical**: staff, client and employee accounts; system and client settings; legal hold; quarantine; deleting an employee; exporting the trail. **Notable**: pay and government IDs; request, leave and filing decisions; deletes of sensitive records; report exports; ID-number lookups; carry-over. **Routine**: everything else. `whereSeverity()` turns a level into a database condition, so the filter runs on the server. |
| API | `GET /audit` takes `severity=`, and every entry carries `severity`. `GET /audit/summary` adds `critical`, the count in the window. New `GET /audit/export` (in `modules/history`, `audit.export`) uses the same filters as the list, minus paging. It writes every match up to **10,000** rows, newest first, with `X-Export-Rows` and `X-Export-Truncated` headers. |
| CSV | `src/csv/csv.ts` is now the shared writer (RFC 4180, UTF-8 BOM, CRLF). REP-03's report CSV was refactored onto it, and the reports spec passes unchanged. Columns: `When (UTC), Severity, Actor, Role, Record type, Record id, Action, Client, Before, After, Request id`. Before and after are full JSON. |
| Self-audit | The export writes `audit/export` (Critical) **before** the bytes return. It records `{filters, rows, truncated, sha256}`: the act and a fingerprint of the exact file, never the rows, which are the log itself. It is registered in `AUDITED_READS` and as `staff` in the isolation registry. |
| Web | The Audit trail shows a severity pill on every **Notable/Critical** row; routine rows stay quiet, since they are most of the log. The entry dialog always shows its severity. There is a new **Severity** filter. **Flagged critical** is a real count (today) and a button that filters to today's critical entries. **Export** appears only for `audit.export` holders: it downloads the current filters as `audit-trail-YYYY-MM-DD.csv` and reports the row count, or that it stopped at the cap. The "coming soon" states are gone. New tone domain `auditSeverity`: routine → neutral, notable → warning, critical → critical. |

## Tests

`test/audit-export.e2e-spec.ts` has **8/8**:
- the severity tables;
- **every pair in `AUDITED_WRITES` has a deliberate severity**;
- the list filter;
- the summary `critical` delta;
- the export's contents, BOM, full values, and its audit row whose sha256 equals the file's;
- the notable filter on the export;
- Auditor 200, HR officer 403, anonymous 401.

**Red proofs.** Each piece was disabled in turn and its test failed; each was restored byte-identical:
- a severity row removed;
- the server-side filter ignored;
- the export not audited;
- before/after dropped from the file.

Two pinned specs had to learn the deliberate change. Both were red before the update:
- `role-matrix`: the Auditor narrowing listed `audit.export` as a write.
- `audit-trail`: the summary's exact keys gained `critical`.

**Full API suite 676/676, twice.** Contracts pass; api typecheck and lint, and web typecheck and lint, are clean. **`next build` succeeds**; `/[locale]/audit` is 8.67 kB.

## Live (dev servers restarted; temporary TOTP for the two MFA roles, cleared after)

| Check | Result |
|---|---|
| Administrator, `/en/audit` | Tiles: Events today 2,795 · Actors 3,003 · **Flagged critical 304**. Filters: Actor / Category / Time window / **Severity**. |
| Click **Flagged critical** | **One** request: `/api/audit?limit=50&from=2026-10-04T20:00:00.000Z&severity=critical`. Triggers read *Today* and *Critical*, every pill reads *Critical*, and *Clear filters* appears. |
| **Export** on that view | `audit-trail-2026-10-05.csv`, `text/csv`, BOM `EF BB BF`, the header as above, **304 rows** (all `critical`), before/after JSON present. The note says "Exported 304 events." |
| SQL cross-check | The same rules over `aud_entries` since local midnight give **304**, equal to the tile and the file. The export's audit row (id 60555, administrator) records `{"rows":304,"filters":{"from":…,"severity":"critical"},"truncated":false,"sha256":"c879d86b…1a14"}`. **SHA-256 of the downloaded bytes, BOM included, is `c879d86b…1a14`**, identical. |
| Export with no filters | The local log holds 13,967 entries. **10,000 rows**, 3.6 MB, in about 2 s. The note says "Exported the newest 10,000 events — the export stops there. Narrow the filters for older entries." |
| Exports are themselves critical | The tile went 304 → 306 → 307 as each export was logged. |
| Defect caught | The export's own entry rendered raw codes (`export · audit`). Added `audit.noun.audit` to both locales; it now reads "Exported the audit trail" / «تصدير سجل التدقيق». |
| `/ar/audit` at 375 | «المصنّفة حرجة», «كل مستويات الخطورة», pills «حرج» / «جدير بالانتباه», **0px overflow**; the entry dialog has 0px overflow. |
| Auditor | The Export button is shown. `GET /audit/export?severity=notable&from=−1h` returns 200, 278 rows, `attachment; filename="audit-trail-2026-10-05.csv"`. 0px overflow at 375. |
| HR officer | `/api/audit/export` returns **403** and `/api/audit?severity=critical` returns **403**. |
| Cleanup | `mfa_secret` cleared: 0 seed accounts enrolled. |

## Notes

- **The cap is 10,000 rows, newest first.** The screen says when it stops. A full archive, for
  example a scheduled export to storage, is a separate decision.
- **The export carries full values, including pay and government IDs that appear in
  snapshots.** That is the owner's choice. The file leaves the system's access controls once
  downloaded, which is why every export is Critical and fingerprinted.
- The actor column falls back to the raw id for deleted e2e helper accounts, the same designed
  fallback the screen uses (UX-10b).
