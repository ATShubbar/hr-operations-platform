# GRO-04 — GRO web UI (process board with dual-calendar Hijri deadlines) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → GRO-04 (ACTION-PLAN 4.2)
- Status: done
- Commit: `GRO-04: GRO web UI — process console with dual-calendar Hijri deadlines + completion flow`

## What shipped

The staff GRO console over the `/gro-processes` API, closing the epic. Front-end
only — no API/contract change.

- **GRO console** (`(app)/gro/page.tsx`, nav-gated `gro.read`) — a table
  (employee · type · status · **due date (Hijri · Gregorian)** · reference ·
  **resulting expiry (Hijri · Gregorian)**), filter by client + status.
- **Create** dialog (`gro.process`) — employee picker, type, due date, reference.
- **Status** dialog (`gro.process`) — advances the workflow offering only legal next
  states; when the target is **`completed`** for an expiry-establishing type, a
  **resulting-expiry** date input appears; the app PATCHes `resultingExpiry` then
  POSTs the status, so completion (GRO-03) writes the new expiry back to the
  employee's govdata.
- **Shell** — a "GRO" nav link gated on `gro.read`; `nav.gro` + a full `gro.*` block
  (type labels, status labels, fields) in en + ar.

## Browser verification (live, dev servers on API :3001 / web :61277)

Logged in as the seeded GRO officer (`staff-gro_officer@seed.hr.local`).

| DoD item | Result |
|---|---|
| GRO nav visible (gro_officer has gro.read); Recruiter's Vacancies/Candidates NOT shown for this role | ✅ nav = …/Tasks/**GRO**/Settings |
| Table renders the 3 seed processes with **dual-calendar** due dates | ✅ "Rabiʻ I 2, 1448 AH · August 15, 2026" etc. |
| **Completion through the UI updates the employee's govdata (GRO-03 flow)** | ✅ completed the Iqama-renewal with resulting expiry 2029-03-15 via the dialog → `emp_employees` Ahmed Hassan `iqama_expiry` went **2027-03-15 → 2029-03-15**; the process is `completed`, `resulting_expiry` 2029-03-15 |
| Status change notifies the assignee (GRO-03) | ✅ the bell count rose as each transition fired a notification to the assignee (gro_officer) |
| Status control offers only legal transitions | ✅ approved → {Completed, Cancelled}; the completed step showed the resulting-expiry input |
| Both locales | ✅ en (LTR) + ar (RTL — sidebar right, Hijri·Gregorian dates + statuses in Arabic) |
| No console errors | ✅ `preview_console_logs` error level: none |

The verification's notifications were removed, the seed re-run, and Ahmed's
`iqama_expiry` reset to 2027-03-15, restoring the dev DB.

## Static checks

```
pnpm --filter @hr/web typecheck   # tsc --noEmit — clean
pnpm --filter @hr/web lint         # eslint src — clean (logical-only utilities, RTL)
messages/en.json + ar.json          # both parse; no missing-key warnings
```

## Files

- `apps/web/src/app/[locale]/(app)/gro/page.tsx` (NEW)
- `apps/web/src/components/app-shell.tsx` (GRO nav link, `gro.read`-gated)
- `apps/web/messages/{en,ar}.json` (`nav.gro` + `gro.*`)

## Epic status

**GRO epic (4.2) COMPLETE** — GRO-01 (processes table+service), GRO-02 (API +
workflow + client-rep read-own status-only), GRO-03 (completion → govdata + notify),
GRO-04 (web UI). Fourteen product screens now; the client-portal GRO view and the
`DocumentExpiring → GRO` auto-spawn remain as possible follow-ons.
