# THREAD-02 — Attachments on a request's thread — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → THREAD-02. Decision record: **ADR-016**, now **rev. 1**. Status: **done**.

## Owner decisions

| Question | Answer |
|---|---|
| What does the other side see when someone removes their file? | **A "removed" line** (recommended): the row stays as "File removed by <name> · date", with no download. |
| A limit on files per request? | **20 per request** (recommended). The 21st upload is refused with a clear message. |

## What was built

| Piece | What |
|---|---|
| `req_attachments` (migration `20261004190000_request_attachments`) | Columns: request (FK, restrict), `client_id` + `requester_employee_id` **copied from the request**, uploader, file name, content type, size, storage key, `status` (`pending → available \| quarantined \| rejected`, `available → removed`), `confirmed_at`, `removed_at`.<br>CHECKs: type ∈ PDF/JPG/PNG, 1 B–10 MB, name 1–200, and the status facts.<br>**No DELETE grant for anyone.** UPDATE is column-limited to status, size and timestamps. |
| The life cycle, in the database | Trigger **`req_attachments_guard`**: only the legal moves, and nothing else on a row changes. **It binds staff too**; RLS can't compare old and new, so a trigger does it. |
| RLS | `staff_full_access`. app_client: `client_isolation` + RESTRICTIVE **`client_attach`** (the request matches the row's company AND requester, with columns qualified per the THREAD-01 landmine). app_employee: `employee_own_read` / **`employee_attach`** (a request I raised) / `employee_own_update`. RESTRICTIVE **`attachment_starts_pending`** for all three roles: nobody inserts a file as already checked. |
| `RequestAttachmentsService` (Requests) | One service, the three fenced paths (`AttachmentPath`: staff · client · employee).<br>`create` takes an advisory lock per request, counts available files plus pending ones younger than 15 minutes (≥ 20 → **409**), creates the row and audits it, then returns a 15-minute PUT link.<br>`confirm` (uploader only) checks: missing → **400**; over 10 MB → `rejected`; virus scan → `quarantined`; first bytes ≠ declared type → `rejected`; otherwise `available`. A refused blob is deleted. Audited with the verdict. `RequestAttachmentAdded` fires only for an available file.<br>`download` gives a 5-minute link with the file's name (`inline; filename*=`).<br>`remove` (uploader only, available only) is soft and audited; the blob is deleted after commit. |
| Visibility | Available and removed files show to everyone on the request. Pending, quarantined and rejected files show **only to their uploader**: anyone else gets 404, never a 403 that would confirm the file exists. A removed file loses its name and size in every response. |
| Routes | `/requests/:id/attachments` (list · create · `:fileId/confirm` · `:fileId/download` · `DELETE :fileId`): reads need `request.read` (the Auditor included), writes need `request.comment`, via `scopeOf`.<br>`/me/requests/:id/attachments/…`: the employee's own path, `self-service.read` / `.create`.<br>All 10 routes are in the isolation registry; the 6 writes are in `AUDITED_WRITES` (`request-attachment.create/confirm/remove`). |
| Virus-scan seam | Moved from Documents to **Storage** (`FILE_SCANNER`, `storage/domain/file-scanner.ts`, bound in the global StorageModule). Documents uses the same token, so Requests needs no Documents import. Behaviour unchanged (documents-scan spec green in the full suite). |
| Notifications | The same handler as comments. A staff upload tells the requester; a requester-side upload tells the assignee; never the uploader. Titled "New file on a request" / «ملف جديد على طلب»; the file name is not copied. |
| Web: `requests/request-attachments.tsx` | The prototype's block:<br>• a count, then file rows (icon · name · who · date · size · Download, plus a Trash button with a confirm step on your own files);<br>• "removed" lines;<br>• "Not attached — …" lines (uploader only);<br>• the dashed drop box (click or drop; keyboard-focusable input, visible focus ring).<br>The browser checks type, size and empty files before uploading, and every server refusal maps to a translated message. It sits in `request-thread.tsx` above Comments, with the prototype's rule between them. Staff, client managers and employees all use it. |
| UAT smoke check | New step on the smoke request: the client manager attaches a PDF, confirm says available, **HR downloads the same bytes**, the uploader removes it. This replaces the card's "seeded sample PDF" (see Deviation). |

## Tests

`test/request-attachments.e2e-spec.ts`: **16/16**.

**Through the API:**
1. Staff upload a PDF: available, author keys are exactly `name` + `kind`, the **requester is notified**, and **the downloaded bytes equal the upload**.
2. A client manager's upload **notifies the assignee and not the uploader**; staff see it as `mine: false`, kind `client`.
3. Another company's request → **404** (list, upload, and a real file id under the wrong request).
4. **The Auditor lists and downloads, but uploading is 403.** GRO uploads.
5. A wrong type, over 10 MB, a blank name or an extra key → 400.
6. Confirm checks what actually landed:
   - never uploaded → **400**;
   - text claiming to be a PDF → **rejected**;
   - 10 MB+ uploaded behind a small declared size → **rejected**.

   Neither is downloadable (409), and neither is shown to anyone but the uploader.
7. **EICAR → quarantined**, never served, hidden from others.
8. Removal:
   - GRO and the client manager trying to remove HR's file → **403**;
   - someone else confirming a pending upload → **404**;
   - the uploader's removal leaves `removed` with no name or size, visible to the other side, not downloadable;
   - removing again → 409.
9. **20 uploads in progress, then the 21st → 409**, with a message naming 20.
10. The employee:
    - uploads, lists, downloads and removes on their own request;
    - the client manager sees their file;
    - a colleague's request → **404**;
    - the staff routes → **403**.
11. Audited: `create`, `confirm` and `remove`.

**At the database** (raw role connections):
- A client manager can't attach to another company's request or mis-copy the requester.
- An employee can't attach to a colleague's request, **even labelled with their own id**.
- **No role (staff included) inserts a file as already checked.**
- **Only the legal moves, for staff too:** removed never becomes available again, pending can't skip to removed, available can't go back to pending, and the client can't rename.
- **Nobody deletes a row**, staff included.

**Red proofs.** Each fence loosened in turn; exactly its test went red each time:

| Loosened | Result |
|---|---|
| `client_attach` → `true` | the company-fence test failed |
| `employee_attach` → requester-only | the "labelled with my id" forgery went through |
| `attachment_starts_pending` → `true` | the "already checked" insert went through |
| guard trigger disabled | the legal-moves test failed |
| app: uploader check removed from `remove()` | the remove test failed |
| app: type check skipped | the confirm-check test failed |
| app: 20-file limit skipped | the limit test failed |

All restored → 16/16, and the service file is byte-identical to before the probes.

**Full API suite: 617/617** (601 + 16). `@hr/api`, `@hr/web` and `@hr/contracts`: lint + typecheck green.

## Live (local, browser)

**HR officer (en, desktop):**
- The empty state read "Nothing attached yet." and the drop box was shown.
- An upload of "Al Rajhi template.pdf" through the component's own file input became **"You · 4 Oct · 1 KB"**, count 1.
- Then:
  - a text file named .pdf → "This file wasn't attached: it isn't the PDF, JPG or PNG it appears to be…" plus a "Not attached — not a valid…" row;
  - the EICAR test file → "The virus check stopped this file…";
  - a .txt → refused in the browser before upload.
- Download opened a MinIO link whose response carried `Content-Disposition: inline; filename*=UTF-8''Al%20Rajhi%20template.pdf` and the uploaded bytes.

**Client manager A (en):**
- Saw HR's file named "Omar Al-Shehri", **without** HR's two refused files, and **no Remove button on HR's file**.
- Attached a PNG, then removed it through the confirm step ("Remove this file? Everyone on the request will see…").
- HR then saw **"File removed by Abdulaziz Al-Ghamdi · 4 Oct"**.

**Employee Ahmed Hassan (ar, 375px):** attached «نسخة جواز السفر.pdf», «تذكرة الطيران.jpg» and «عقد العمل.pdf» on a request they raised. 0px overflow.

**HR officer (ar, 375px):** saw the employee's three files named "Ahmed Hassan", **0 Remove buttons**, and 0px overflow.

**Smoke step, run locally** against the dev stack: the 5 new attachment checks passed, all checks passed.

**Two Arabic defects caught on screen, both fixed:**
1. **File names were right-aligned.** As a flex child, `<bdi>` is blockified, so `dir=auto` also flipped its alignment. Now a `<span class="truncate">` holds a `<bdi>`: measured left gap **0px** for both Arabic names, each reading in its own direction with the extension at its logical end.
2. **A file name inside a toast sentence reordered the sentence.** I first tried Unicode isolate marks (FSI…PDI, the string form of `<bdi>`). That made it **worse**: inside the LTR layout (ADR-012) an isolate splits the Arabic sentence into runs laid out left to right, putting the verb at the wrong end. The file name now stays out of sentences ("File attached." / «أُرفق الملف.», "Uploading…"); the row right below names it.

Wording fix: your own removal reads **"You removed a file · date"** rather than "File removed by You".

**Cleanup:** all local attachment rows, the employee's verification request and the 6 smoke requests (with their tasks and notifications) were deleted, then the DB re-seeded. Result: **9 requests, 3 comments, 0 attachments**.

## Deviation from the card, stated

The card said the seed would add "one sample PDF that actually exists in storage". **Not done.** The UAT seed job (`uat-seed` service account) has no access to the bucket or the storage HMAC secrets, and giving it access is a new IAM grant: a cloud change that needs your approval. It is the same gap as the open **SEED-01** follow-up (seeded documents have no files). Instead, the **UAT smoke check proves the round-trip** through the app: upload, check, HR downloads the same bytes, removal. Both belong in SEED-01 if seeded files are wanted.

## UAT readiness

The UAT bucket's CORS was read (read-only): `PUT`/`GET`/`HEAD` from `https://uat.peopleandgro.com` with `Content-Type` allowed. Browser uploads will work there.

Still the dev scanner on UAT (EICAR-only); real ClamAV is an infrastructure card before production.
