# ADR-021 — The notification centre: an escalation ladder, derived, not stored

- Status: Accepted (rev. 1, 2026-10-10: four points settled while building NC-01; rev. 2, 2026-10-11: six points settled while building NC-05)
- Date: 2026-10-10
- Owner: Ahmed Alshubbar (product decision; NC-00)
- Amends: **architecture.md**. A new delivery module, one permission and one matrix row. Now **v1.15**.

## Context

The app's bell lists **events**: a request was approved, a comment was added, a task was handed over, a leave request was decided. They are stored rows, written when the thing happens.

The prototype's notification panel is something else. Its own comment says it: *"Notifications are not a feed of things that happened."* It is an **escalation ladder**, worked out from the register every time it is shown:

| Rule | Watches | Notice | Reminder | Escalated | Breach |
|---|---|---|---|---|---|
| Document expiry | every dated document on a person, and on their dependants | 30 days before | 14 | 7 | lapsed |
| Queue deadline | open procedures and tasks | 5 days before | 2 | 1 | past its deadline |
| Request service level | requests waiting on a decision | – | 2 days before | 1 | breached |

- An item shows **only the highest stage it has reached**. A lapsed iqama does not also announce its 30-day notice.
- Each stage **widens who is told**: the assigned officer, then HR, then the Administrator, and at Breach the client.
- A document already being renewed in the work queue **stays quiet**.
- The panel has three tabs (Needs action · Assigned to me · Everything), groups items by stage, and marks items read.
- An **Escalation rules** dialog lets the Administrator change the day thresholds. Everyone else reads them.

Two things shaped the decision:

- The existing Notifications module is a shared module that GRO and Self-Service import. It cannot read people, procedures or requests without creating an import loop, so the ladder cannot live there.
- The app already has a daily document-expiry scan (60/30/14/7/1/0 days, switched off by default) that writes bell items, sends email and opens renewal procedures. Its thresholds differ from the ladder's.

## Options considered

1. **Store ladder items as notifications**, written by a daily job. Rejected: a stored item goes stale the moment a date is renewed or a threshold changes, and the prototype's central property (change a threshold and the panel changes with it) is lost.
2. **Derive in the browser** from the list endpoints, as the dashboards do. Rejected: each viewer would download whole registers to show a dozen lines, and "who is told at this stage" would be decided where it cannot be enforced.
3. **Derive on the server, per viewer, store only read marks** (chosen).

## Decision (owner decisions marked ★)

### What the ladder is

- The ladder is **derived at the moment of asking**. No ladder item is ever stored. The only thing stored is which items a person has marked read.
- Three rules, as the prototype:
  - **Document expiry.** The dated documents on a person's record: iqama, work permit, passport, contract end. And on each dependant: iqama, passport, insurance. These are the same dates the expiry runway and the People screen use, so the panel and those screens cannot disagree. Insurance and driving licence on the employee are still not stored and are not in the ladder. Only people under management are watched (the shared headcount rule): not leavers, not people still arriving, not archived companies.
  - **Queue deadline.** Open procedures and open tasks that have a due date, by the shared definition of "finished".
  - **Request service level.** Requests waiting on a decision (`open`), against their own due date. That date already counts working days and pauses while more detail is awaited (ADR-016), so the ladder counts calendar days to it. A request waiting on its requester is not in the ladder: its clock is paused.
- Four stages, in rising order: **Notice → Reminder → Escalated → Breach**. An item is at a stage when the days left are at or below that stage's threshold. **Breach is fixed**: the date has passed. "Today" is the system timezone's date.
- **Only the highest stage reached is shown.**
- **Suppression.** An expiring iqama or work permit is quiet while an open procedure that renews it exists for that person (iqama issue or renewal; work-permit renewal). The panel says how many items are quiet for that reason. Passport, contract and dependant documents have no such procedure and are never suppressed.

### Settled while building (rev. 1, NC-01)

Four points the first text left open. Each follows from a rule already above.

- **One obligation is reported once.** A request spawns a task the moment it is raised. While that request still awaits a decision, or is paused on its requester, its task is not in the queue rule: the request's own service-level item speaks for it. Once the request is approved, the task carries the deadline.
- **A Saudi national's iqama and work permit are not watched.** They have neither; this is the People screen's rule.
- **An expiry owned by a role is owned by each person in that role.** With no named officer, every GRO officer has the company's iqamas under "Assigned to me".
- **The count of quiet items is per viewer.** It counts only expiries that person could have read.

### Settled while building (rev. 2, NC-05)

- **Self-Service imports Escalations.** The employee's ladder is served under `/me`, and the gate for `/me` (the session's own record, the company's switch, a live record) lives in the Self-Service module. Rather than copy that gate, Self-Service calls the Escalations service. Escalations imports only domain modules, so the edge closes no loop. "Nothing imports it" above now reads: nothing but Self-Service.
- **A client manager's tabs are Needs action and Updates.** They are told only at Breach, so "Everything" would repeat "Needs action", and nothing is ever assigned to them.
- **An employee's tabs are Needs action, About me and Updates.** Every item is about them, so "About me" is everything.
- **A client manager is never shown an owner.** To them the work is PEOPLE&GRO's.
- **A client manager sees no dependant.** ADR-017 gives clients no view of dependants; the ladder follows it.
- **An employee's open procedures are read on the staff connection**, for one purpose: to keep quiet a document that is already being renewed. No procedure is returned to them.

### Who is told at each stage

| Stage | Document expiry | Queue deadline | Request service level |
|---|---|---|---|
| Notice | owner | owner | – |
| Reminder | owner, HR officers | owner, HR officers | owner, HR officers |
| Escalated | owner, HR officers, Administrators | owner, HR officers, Administrators | owner, HR officers, Administrators |
| Breach | owner, HR officers, Administrators, the client | owner, HR officers, Administrators | owner, HR officers, Administrators, the client |

- ★ **The owner of an expiry is the client's named officer** (the officer recorded on the client's profile, ADR-019). If none is recorded, or that account is no longer active, the prototype's rule by document type applies: iqama, work permit, passport and dependants' iqama and passport go to the GRO officers; contract end and dependants' insurance go to the HR officers.
- The owner of a queue item is its assignee. The owner of a request is its assignee. An item with nobody assigned has no owner and is first shown at the stage that names a role.
- **Nobody is shown an item they could not already open.** Being in a stage's audience never widens access: each item is also checked against the viewer's own read access (the person's record and that date field, the procedure, the task within the viewer's task scope, the request).
- **The Auditor is in no audience.** They read "Everything" and never have anything in "Needs action". (The prototype has no Auditor; this follows "reads everything, changes nothing".)

### The panel

- **Needs action**: the viewer's items at Escalated or Breach. **Assigned to me**: items the viewer owns. **Everything**: for staff, every item they may read; for a client manager or an employee, all of theirs.
- ★ **A fourth tab, "Updates", keeps today's events.** Request decisions, comments, assignments and leave decisions stay exactly as they are, in the same panel. This is the one deviation from the prototype's panel.
- The bell's count is the unread items in Needs action plus the unread updates.
- Opening an item marks it read and goes to where it is acted on: the request, the work item, or the person's documents.
- **Read marks.** A mark records the item, the stage and the date it was about. An item that climbs to a higher stage, or whose date changes, is unread again.

### Thresholds

- The day thresholds are a **system setting the Administrator edits** (`config.write`), seeded with the prototype's figures. The values come from a fixed list (1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60 days), and within a rule a later stage may not start earlier than the one before it.
- Changing a threshold changes what everyone sees at once. It is audited like any system setting.
- Everyone who can see the ladder can read the rules in force.

### Email ★

- ★ **In-app only for now.** Reaching a stage sends nothing.
- **The existing daily expiry scan is left exactly as it is**, switched off by default. Until stage emails are built there are two sets of expiry thresholds in the system: the scan's (for its emails and auto-opened renewals, when switched on) and the ladder's (for the panel). When stage emails are built, that card must replace the scan's thresholds with the ladder's. This ADR records the overlap so it is not discovered later.

### Client managers and employees ★

- ★ **Both are included, in a later card than the staff panel.**
- A **client manager** is in the audience only at Breach: a lapsed document of one of their people (only while their portal is switched on, and never showing more than the portal shows), and one of their own company's requests past its service level. No queue items.
- An **employee** sees the items about their own record: their own and their dependants' document expiries, at every stage, and their own requests' service level. Only while self-service is switched on for their company. No queue items: an employee has no view of procedures.
- Both keep the Updates tab.

### Permissions

- One new permission, `escalation.read`: Administrator, HR officer, GRO officer, Auditor, and (with their card) Client manager. It covers reading the ladder and marking one's own items read, as `notification.read` does for the bell.
- Employees never hold it. Their ladder is served under `/me`, behind `self-service.read`, like everything else of theirs (ADR-011).
- Staff and client managers share the route; `scopeOf` decides the path, and any other principal is refused.

### Ownership and module boundaries

- A new delivery module, **Escalations**. It reads Clients, Employees (and dependants), GRO, Tasks, Requests, Configuration and Auth through their public APIs. Nothing imports it.
- It owns one small table: the read marks. They hold no personal data beyond a user id and an item's identifier.
- The Notifications module is unchanged.

### Out of scope

- Email, SMS or any message outside the app.
- Storing ladder items, or a history of what was shown.
- Rules beyond the three above, and per-client thresholds.
- Changing who is told at each stage from the screen. The audiences are fixed here.
- Snoozing or dismissing an item. It leaves the ladder when the date is renewed, the work is finished or the request is decided.
- The daily expiry scan, its emails and its auto-opened renewals.

## Consequences

- The bell becomes the prototype's panel, with one extra tab.
- The ladder is always current, because it is never stored. It costs a set of reads each time the panel loads; at this size that is acceptable, and if it becomes slow the answer is a short per-person cache, not storage.
- Two sets of expiry thresholds exist until stage emails are built.
- The named officer on a client's profile gains its first behaviour: it decides who owns that client's expiries. ADR-019 said the service facts carry no behaviour; this ADR changes that for the officer only.
- An unassigned procedure or task is invisible at Notice stage. That is deliberate: there is nobody to tell.

## Build

- **NC-01:** the ladder for staff: rules, stages, thresholds setting, audiences, suppression, the API.
- **NC-02:** read marks and the bell's count.
- **NC-03:** the panel in the header, with the Updates tab.
- **NC-04:** the Escalation rules dialog.
- **NC-05:** client managers and employees.
- **NC-06:** sample data and UAT smoke checks.

## Links

- ADR-004 (events — unchanged)
- ADR-011 (employee self-service)
- ADR-012 (prototype fidelity)
- ADR-013 (roles and the matrix)
- ADR-016 (request service levels)
- ADR-017 (dependants' expiries, left out of alerts until now)
- ADR-019 (the client's named officer)
- CAL-04 (the shared definition of "finished"), REP-06 (the shared headcount rule)
