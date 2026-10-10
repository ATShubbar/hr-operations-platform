# ADR-019 — The client profile and the Nitaqat band

- Status: Accepted
- Date: 2026-10-10
- Owner: Ahmed Alshubbar (product decision; PROF-00)
- Amends: **architecture.md**, the Clients module's description. Now **v1.13**. The role matrix does not change.

## Context

A client company is, today, a name in two languages and a status (`cli_clients`, CLIENT-01). The prototype's client carries much more, and the app shows "coming soon" wherever it would appear:

- the Clients cards ("Sector · city · CR — coming soon", and the status sitting in the band's slot);
- the Client record's **Nitaqat position** and **Service** panels (DS-10);
- the Client record's **Records** tab, apart from company documents (DS-22a);
- the Overview's portfolio column "Nitaqat band" and the Reports panel "Saudisation by client" ("Band soon").

In the prototype the Nitaqat band is a **stored field**: the administrator picks it when adding a client, next to the commercial registration, city and sector. It is not calculated from the register. So the band is part of the client's profile, and the two are one piece of work.

## Options considered

1. **Calculate the band from the employee register.** Rejected. The app holds each person's nationality and a "counts toward Saudisation" flag, but not the things the official figure depends on. A calculated band that disagrees with Qiwa would be worse than none.
2. **Store the band as staff read it from Qiwa**, with the date it was checked (chosen).
3. **Separate tables for contact, signatories and registrations.** Rejected for now: one main contact and a short list of signatories do not need their own life cycle. They are columns and one list on the client's row. If contacts grow (several per client, each with a login), that is a new decision.

## Decision (owner decisions marked ★)

### What a client's profile holds

All of it belongs to the **Clients** module and lives on the client's own row. Every field is optional, because existing clients predate them; a missing value is shown as "Not recorded".

| Group | Fields |
|---|---|
| Identity | Commercial registration number (ten digits; no two clients share one) · city · sector |
| Nitaqat | Band: Red · Yellow · Low green · Medium green · High green · Platinum · the date it was last checked |
| Registrations | Qiwa establishment number · GOSI establishment number · VAT number (fifteen digits) |
| Main contact | Name (English and Arabic) · role · email · phone |
| Authorised signatories | A list of up to ten, each a name and a role |
| Portals | Which government portals PEOPLE&GRO holds credentials for |
| Service | Named officer · tier (Essential, Professional, Enterprise) · response commitment (same working day, one working day, two working days) · term start and end |

- **City and sector are fixed lists** (the prototype's nine of each), stored as keys and translated. A list grows by a code change.
- **The band is stored, never computed.** Setting a band requires the date it was checked; clearing the band clears the date. The Saudi-share bar beside it stays labelled as a count by nationality.
- **Portals are names only.** The app records *that* credentials are held for Qiwa, Muqeem and so on. It never stores a username, password or token for any portal.
- **The named officer** is an active staff account that may handle government procedures (the same rule as a procedure's assignee, ASSIGN-01).
- ★ **The Service fields are recorded facts with no behaviour.** The tier does not switch features on or off. The response commitment is a label: request due dates keep coming from the per-type service levels (ADR-016 rev. 3).
- **Money is out of scope.** Platform fee, seat rate, billing cycle, purchase order, payment terms, account standing and invoices belong to Billing. The Commercial and Fees tabs stay "coming soon".

### Who

- ★ **Administrators change a profile; nobody else does.** This is the matrix as it stands (`client.update`). HR officers, GRO officers and the Auditor read it (`client.read`). No new permission.
- ★ **A client manager sees their own company's whole profile, read-only.** They change something by raising a request.
  - It reaches them through the client portal's company view, so it follows the portal switch (`flag.client-self-service`) like the rest of the portal.
  - The named officer is shown to them by name and role only.
- **Employees see none of it.**
- Company registration numbers and a business contact's details are not treated as restricted: every reader above sees every field.

### What a band changes ★

★ **A Red or Yellow band warns at the moment of the action. Nothing is blocked.**

The rule follows the prototype's own wording for each band:

| Band | Warn when… |
|---|---|
| **Red** ("work permits and transfers are blocked… every hire must be Saudi") | a non-Saudi candidate is moved to Visa & mobilisation or onboarded directly; a work-permit renewal or a sponsorship transfer is started for that client |
| **Yellow** ("renewals still pass, but new permits are restricted") | a non-Saudi candidate is moved to Visa & mobilisation or onboarded directly |
| Green bands, Platinum, or no band recorded | never |

- The warning appears in the confirmation those actions already show, or in the Start-a-procedure dialog. It names the band and the date it was last checked.
- The person can still proceed, and the server refuses nothing: the stored band may be out of date, and Qiwa is the authority.
- The rule is one function shared by every screen that warns, so they cannot disagree.

### Audit

Every change to a profile is audited against the client, with the changed fields before and after, as client changes are today.

### Out of scope

- Calculating or forecasting the band.
- A history of bands over time (the audit trail holds each change).
- Several contacts per client, or contacts with their own sign-in.
- Editable city, sector or portal lists.
- A per-client response commitment that drives request due dates.
- Everything on the Commercial and Fees tabs.
- Finding a client by its registration number in global search.

## Consequences

- The client's row grows by about twenty columns. Client managers already read their own row at the database, so the new columns are readable by them with no new grant, which is what the owner chose.
- The portal's company view returns the profile. A client manager with the portal switched off sees none of it.
- Six "coming soon" placeholders become real: the card line, the band slot on cards, the Nitaqat and Service panels, the Records tab's profile content, the portfolio column, and the Reports band.
- The Hiring confirmations and the Start-a-procedure dialog gain a warning that depends on data owned by another module. They read the client's band through the Clients API; no server module gains a dependency.

## Build

- **PROF-01:** the data and the API (new fields, validation, the client manager's read path).
- **PROF-02:** Add and Edit client, the Clients cards and the record's header.
- **PROF-03:** the Nitaqat panel, the Overview portfolio column and the Reports band.
- **PROF-04:** the Records tab (contact, signatories, registrations, portals).
- **PROF-05:** the Service panel and seed data.
- **PROF-06:** the band warnings.

## Links

- ADR-012 (prototype fidelity)
- ADR-013 (roles and the matrix)
- ADR-016 rev. 3 (service levels per request type)
- ADR-018 (the Hiring moves that create an employee)
- CLIENT-01..04 (the clients registry)
- PORTAL-01 (the portal's company view)
- ASSIGN-01 (who may be handed government work)
