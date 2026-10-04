# DS-22a — Company documents → Client record; Expiry retired — Evidence

- Date: 2026-10-04
- Task card: `BACKLOG.md` → DS-22a (DS epic, ADR-012)
- Status: done
- Commit: `DS-22a: company documents on the Client record; Documents and Expiry retired`
- Scope: `apps/web` only. **No API change.** As promised on the card, I checked first: `GET /documents?clientId=` already returns a company's documents, each with its `employeeId`, so the tab keeps the ones attached to no person.

## Owner decision (with DS-22)

"Fold them into prototype screens":
- company documents go to the Client record's **Records** tab;
- the expiry dashboard is retired: its view is the Overview runway and People's filters, and its **Run scan now** moves to Settings → System;
- the old URLs redirect.

## What changed

| File | Change |
|---|---|
| `clients/[id]/records-tab.tsx` (new) | **Company documents**: the client's documents with no person attached, not deleted. Each row: title · category · file name (· On legal hold), a status pill when not available, expiry (both calendars) with People's time-left chip, Download (300 s presigned), and Delete with a confirm dialog (`document.delete`; none while on legal hold). **Add document** (`document.upload`) is the DOC-02 flow with no employee: issue → PUT to the object store → confirm. Below it, the prototype's Records content (contact, signatories, registrations, portals) stays "coming soon" |
| `clients/[id]/page.tsx` | Records joins the built tabs |
| `settings/expiry-scan.tsx` (new) | Settings → System → **Document expiry**: Run scan now (`POST /expiry/scan`, `expiry.run`) with its summary. The System tab now also appears for `expiry.run` holders (the Administrator) |
| `documents/page.tsx`, `expiry/page.tsx` | Now redirects: `/documents` → `/clients`, `/expiry` → `/overview` |
| `app-nav.tsx`, `header-location.tsx` | Documents and Expiry leave "Other tools" and the header map |
| `messages/{en,ar}.json` | `clients.records.*`, `settings.scanTitle/scanSubtitle`. **Pruned:** `documents.*` keeps only `category` (its only remaining use), `expiry.*` keeps only the four scan keys, and `nav.documents` / `nav.expiry` are gone |

## Live verification (web restarted)

**HR officer** (`document.upload` and `document.delete`), Alpha Trading → **Records**:
- **Empty first:** "No company documents yet." The seed has none.
- **Add document:** "DS-22a Commercial registration", category Contract, expiry 2026-10-10, a small PDF built in the page. It listed as "Contract · cr-copy.pdf · 10 Oct 2026 · Rabiʻ II 29, 1448 AH · **6d left**", with no status pill, i.e. it scanned clean and became available.
  - Database: `category = contract`, **`employee_id IS NULL`**, `status = available`.
- **Download:** a 300-second presigned link returned **200** with the exact bytes (`%PDF-1.4 DS-22a test`).
- **Delete:** the confirm dialog read "“DS-22a Commercial registration” will be removed from the company's documents." The list returned to empty, and the database showed `status = deleted` (soft delete). The audit log has `create`, `confirm` and `delete`.
- **Cleanup:** the test row and its stored object were deleted (20 seed documents, as before).

**Redirects:** `/en/documents` → `/en/clients`; `/en/expiry` → `/en/overview`.

**Nav:** "Other tools" now holds GRO, Task history and Google Calendar (DS-22b and DS-22c take those).

**Run scan:**
- The **HR officer** doesn't hold `expiry.run`, so has no System tab.
- The **Administrator** (MFA temporary, cleared afterwards): System → Document expiry → **Run scan now** → "Scan complete — 15 scanned, 0 alerts raised, 0 notifications sent."
  - SQL: 15 available documents expire within 60 days, overdue included.
  - Because the scan changes data, counts were snapshotted first: alerts 37, notifications 1,329, procedures 20 — **all unchanged after**. Every threshold that was due had already alerted (the `exp_alerts` ledger).

**Layout and locales:** the Client record with Records selected, `/ar` and `/en` × 1280 and 375 — 0px page overflow, one `h1`, no raw keys («السجلات» → «وثائق الشركة»).

**Gates:**
- Web typecheck and lint clean; prettier clean.
- **`next build` succeeds**: `/[locale]/clients/[id]` 11.3 kB; `/documents` and `/expiry` 304 B each (redirect only).
