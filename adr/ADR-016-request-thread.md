# ADR-016 — The request thread: comments and attachments both sides see, "Ask for more detail", a service level per type

- Status: Accepted
- Date: 2026-10-04
- Owner: Ahmed Alshubbar (product decision; THREAD-00)
- Amends: **architecture.md** — the Requests row of the permission matrix, the permission catalog
  (`request.comment`) and the request status set (`info_needed`). Now **v1.10**.

## Context
The prototype's request detail carries a **thread** — a file list ("Signed forms, tickets and
stamped copies · PDF or JPG up to 10MB") and comments ("visible to both sides") — an **"Ask for
more detail"** decision that pauses the service-level clock, and a **service level per request
type** in working days. The web app has shown all three "coming soon" since DS-08; nothing exists
behind them: no comments, no way to link a file to a request (documents carry no request id, and
neither client managers nor employees can upload anything), no status for "waiting on the
requester", and no turnaround beyond a hand-set due date.

## Decision (owner decisions marked ★)

### Ownership and shape
- The thread belongs to **Requests**. Two tables, `req_comments` and `req_attachments`, each
  **denormalising the request's `client_id` and `requester_employee_id`** so database isolation
  never needs a join (the client-scoped and employee-readable table checklists).
- Files are the request's own (`req_attachments`), not `doc_documents`: they are correspondence
  about one request, not the employee's document record, and they need writers the document
  registry deliberately doesn't have (client managers, employees).

### Who sees, who posts
- ★ **Everything on the thread is visible to everyone who can see the request** — staff, the
  client manager for that company (employee-raised requests included, ADR-011), and the employee
  on requests they raised. **No internal notes**: internal discussion belongs in tasks / the work
  queue.
- ★ **Who posts**: Administrator, HR officer, GRO officer, the client manager on their company's
  requests, the employee on their own. **The Auditor reads the thread but cannot post** ("reads
  everything, changes nothing", ADR-013). New permission **`request.comment`** for the four staff/
  client roles; employees post through `/me/requests/:id/…` under `self-service.*` (never a
  staff permission, ADR-011 rev. 2).
- Each path is fenced at the database like requests themselves: staff cross-client, client
  managers on `app.client_id`, employees on `app.employee_id` (rows of requests THEY raised).

### Comments
Plain text up to 4,000 characters. **Not editable, not deletable** — a thread is a record. Every
comment is audited.

### Attachments
PDF, JPG or PNG up to 10 MB. Uploaded browser → storage directly (presigned, as documents), then
confirmed: the **virus-scan hook** (DOC-04) runs before the file can be downloaded; an infected
file is deleted and marked quarantined. Downloads are short-lived presigned links. The uploader may
**remove their own file** (soft delete, audited); nobody removes someone else's.

### Ask for more detail
- A new request status **`info_needed`** ("Info needed"). Staff holding `request.process` move an
  `open` or `in_progress` request into it; the requester is notified.
- ★ **The requester's reply brings it back**: a comment or a file from the requester (client
  manager on their company's request, or the employee who raised it) moves `info_needed → open`
  automatically, and the clock resumes. Staff may also move it on by hand
  (`info_needed → open | in_progress | cancelled`).

### Notifications
A comment by staff notifies the requester (the request's creator); a comment by the requester
notifies the assignee when there is one (otherwise it waits in the work queue, as requests do
today). Category `request` — the existing email preference governs it.

### Service level ★ (built in THREAD-04)
A turnaround **per request type, in working days** (the company's working week, default Sun–Thu;
public holidays are not modelled yet). It sets the due date when a request is raised and
**pauses while the request is `info_needed`** (the due date moves by the paused working days).
Staff can still set a due date by hand. The days per type are confirmed by the owner in the
THREAD-04 card.

### Out of scope
Threads on work items and candidates (they stay "coming soon"), editing comments, @mentions,
read receipts, holiday calendars.

## Consequences
- Two new client-scoped, employee-readable tables (both checklists, the isolation harness with the
  same-company colleague probe, audited writes).
- The first time client managers and employees **upload** anything — a new write path to
  storage, which is why scanning gates every download.
- `info_needed` joins the status workflow: list filters, labels, tones, the decision trail and the
  calendar/queue projections must all know it (they treat it as active, not finished).

## Revisions
- **rev. 1 (THREAD-02, 2026-10-04) — attachments, two owner decisions and one state.**
  ★ A removed file **stays in the thread** as "File removed by <name> · date" (no name, no
  download) — a thread is a record. ★ A request carries **at most 20 files** (an upload still in
  progress holds its slot for the 15 minutes its link lives). A new terminal state **`rejected`**
  sits beside `quarantined`: confirm refuses a file over 10 MB or one whose first bytes aren't the
  PDF/JPG/PNG it claimed (the browser PUTs whatever it likes, so the declared type is checked
  against the file's signature after the virus scan). The legal moves (pending → available |
  quarantined | rejected, available → removed) are a database trigger that binds staff too. The
  virus-scan seam moved from Documents to **Storage** (architecture.md already lists scanning
  under Storage), so Requests doesn't depend on Documents. No matrix or catalog change.

## Links
- architecture.md v1.10; ADR-004 (events), ADR-011 (self-service), ADR-012 (prototype fidelity),
  ADR-013 (roles); DOC-04 (scan hook)
- `design/…/People & Gro Console.dc.html` — request detail (thread, decisions), `threadFor`,
  `REQ_SLA`, `askInfo`
- `BACKLOG.md` → THREAD-00..04; `evidence/arch/THREAD-00.md`
