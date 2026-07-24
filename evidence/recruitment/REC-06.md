# REC-06 — Recruitment web UI (vacancies + candidate pipeline board) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → REC-06 (ACTION-PLAN 4.1)
- Status: done
- Commit: `REC-06: recruitment web UI — vacancies console + candidate pipeline board`

## What shipped

The staff-facing recruitment screens over the vacancies + candidates APIs, closing
the epic. Front-end only — no API/contract change.

- **Vacancies console** (`(app)/vacancies/page.tsx`, nav-gated `vacancy.read`) — a
  table (title · client · department · headcount · status), filter by client +
  status, a **create** dialog (`vacancy.create`, bilingual title), and a **status**
  action that offers only legal next states (`vacancy.approve`).
- **Candidate pipeline** (`(app)/candidates/page.tsx`, nav-gated `candidate.read`) —
  a **stage board**: lanes applied → screening → interview → offer → hired + a
  rejected/withdrawn lane; each candidate a card (name · vacancy · nationality ·
  email); a per-card **Move to…** control that offers only legal next stages
  (`candidate.advance`), with **Hire →** at the offer stage; a **create-candidate**
  dialog capturing name + nationality.
- **Shell** — two nav links gated on `vacancy.read` / `candidate.read`; `nav.*` +
  `vacancies.*` / `candidates.*` i18n in en + ar.

## Browser verification (live, dev servers on API :3001 / web :61469)

Logged in as the seeded recruiter (`staff-recruiter@seed.hr.local`).

| DoD item | Result |
|---|---|
| Vacancies + Candidates in nav (recruiter has the perms) | ✅ sidebar shows both |
| Vacancies list renders the seed data | ✅ Civil Engineer/Site Supervisor/Senior Accountant with status badges |
| Pipeline board groups candidates by stage | ✅ Applied/Screening/Interview lanes populated; Offer/Hired/closed empty |
| Stage control offers ONLY legal moves | ✅ Interview → {Offer, Rejected, Withdrawn} (no Hired-skip); Offer → {Hire →, Rejected, Withdrawn} |
| **Hire through the UI creates an employee (REC-05 flow end-to-end)** | ✅ advanced Noura interview→offer→hired (two `POST /candidates/:id/stage → 200`); DB then held `emp_employees` row **Noura Alharbi, nationality SA, contract_type unlimited, active, client A** |
| Board reflects transitions; `hired` terminal (no control) | ✅ Noura moved to the Hired lane, card has no Move-to control |
| Both locales | ✅ en (LTR) + ar (RTL — board flows right-to-left, lanes translated) |
| No console errors | ✅ `preview_console_logs` error level: none |

The verification hire's employee + audit row were removed and the seed re-run
afterward, restoring the dev DB to 3 seed employees / Noura back at `interview`.

## Static checks

```
pnpm --filter @hr/web typecheck   # tsc --noEmit — clean
pnpm --filter @hr/web lint         # eslint src — clean (logical-only utilities, RTL)
messages/en.json + ar.json          # both parse; no missing-key warnings
```

## Files

- `apps/web/src/app/[locale]/(app)/vacancies/page.tsx` (NEW)
- `apps/web/src/app/[locale]/(app)/candidates/page.tsx` (NEW)
- `apps/web/src/components/app-shell.tsx` (2 nav links, capability-gated)
- `apps/web/messages/{en,ar}.json` (`nav.vacancies`/`nav.candidates` + `vacancies.*` / `candidates.*`)

## Epic status

**Recruitment epic (4.1) COMPLETE** — REC-01 (vacancies table+service), REC-02
(vacancies API + approve workflow + client-rep read-own), REC-03 (candidates
table+service), REC-04 (candidates API + stage workflow), REC-05 (CandidateHired →
Employees event), REC-06 (web UI). Thirteen product screens now; the 4th ADR-004
event flow live.
