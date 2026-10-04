# THREAD-00 — The request thread into the architecture (ADR-016, architecture.md v1.10) — Evidence

- Date: 2026-10-04
- Status: **done**. Documentation only: no code, nothing deployed.

## Owner decisions (asked; answers recorded)

| Question | Answer |
|---|---|
| Who sees a request's comments? | **Everyone on it (prototype)**: no internal notes |
| How does a request leave "Info needed"? | **The requester's reply returns it** (recommended). Staff can also move it by hand. |
| Service level in this epic? | **Yes, as THREAD-04** (recommended). The owner confirms the days per type there. |
| Who can post? | **All who see it, except the Auditor** |
| The THREAD-00 card | **approved** |

## What the research found first

- **Prototype:**
  - the request detail has an Attachments list (upload hint "PDF or JPG up to 10MB") and Comments ("visible to both sides"; no internal/external distinction);
  - anyone who sees the request can post;
  - "Ask for more detail" sets an `info` status that pauses the SLA clock, and only a staff "withdraw decision" leaves it. Hence the owner's choice of a requester-reply exit.
  - `REQ_SLA` is per type in working days (Fri/Sat skipped).
- **App:**
  - thread, Ask for more detail and service level are all "coming soon" (DS-08), and the employee's My requests has no detail view;
  - **nothing comment-like exists**;
  - `doc_documents` has no request link, and its controller is staff-only; client managers and employees can upload nothing today;
  - the request workflow has no "waiting on requester" state;
  - `dueDate` is set by hand. REQ-03's "SLA" was only that, and the Reports service-level card measures against it.

## What changed

| File | Change |
|---|---|
| `adr/ADR-016-request-thread.md` | NEW. Ownership + shape, who sees / posts, comments, attachments, `info_needed`, notifications, service level, out of scope, consequences. |
| `architecture.md` | **v1.10** + changelog; the catalog gains `request.comment`; the Requests matrix row gains "+ comment" per role (Auditor: thread read, no posting). |
| `adr/README.md` | ADR-016 indexed. |
| `BACKLOG.md` | THREAD-00 (done), THREAD-01..04. |
| `CLAUDE.md` | State + map (v1.10, ADR-001..016). |

## Choices of ours, stated in the card

- The files are the **request's own table**, not `doc_documents`: they're correspondence, and need writers the registry deliberately lacks.
- Thread rows **denormalise `client_id` + `requester_employee_id`**, so database isolation never needs a join.
- Comments are **immutable**. An uploader may **remove their own file** (soft, audited).
- Every download is gated by the **existing scan hook**: this is the first upload path for client managers and employees.
- Notifications: staff comment → requester; requester comment → the assignee if set.
