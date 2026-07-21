# Reference-system field mapping (ACTION-PLAN 0.8)

**Status:** ACTIVE — the authoritative source for the Employees schema (EMP-01)
and, later, GRO and Billing. **Design for compatibility, do NOT build
connectors** (architecture.md → Reference systems). v1 is **manual entry**; the
shape is **connector-ready** so a future integration is a connector task, not a
schema migration.

This document lists the exact Employee-relevant fields and enums each Saudi
reference system requires the schema to carry, and tags each field with its
**sensitivity group** (the permission that gates it) and its **client-rep
visibility**. EMP-02 (field-level authorization) is generated from these tags.

## Sensitivity groups → permissions (architecture.md matrix)

A sensitive field group is its own resource so access is independently grantable
(`salary.read`, not `employee.salary.read`).

| Group | Permission | Staff who read (matrix) | Client-rep (own client) |
|---|---|---|---|
| `core` | `employee.read` / `employee.update` | SysAdmin R, CompanyAdmin CRUD, Recruiter R, HR Officer CRUD, GRO RU, Finance R, ReadOnly R | **R (own)** |
| `salary` | `salary.read` / `salary.update` | SysAdmin R, CompanyAdmin R, HR Officer RU, Finance RU | **none** |
| `govdata:id` | `govdata.read` / `govdata.update` | SysAdmin R, CompanyAdmin R, HR Officer R, GRO CRUD, ReadOnly R | **none** (identifiers hidden) |
| `govdata:status` | `govdata.read` | same as `govdata:id` | **R (own) — expiry/status only** |

`govdata` is split into two visibility tiers because the matrix says client reps
see government data **"expiry/status only"**: identifiers (iqama/passport/border
numbers) are `govdata:id` (staff only); expiry dates and statuses are
`govdata:status` (a rep may see them for their own client's employees).

## Date handling (ADR-005)

Every date below is **stored as Gregorian UTC** and **rendered Hijri**
(Umm al-Qura) via `@hr/dates` — never stored as Hijri. Marked ⏳ in the tables.

---

## Core — `employee` (personal + employment)

| Field | Type / enum | Ref system | Notes |
|---|---|---|---|
| `name_ar` | string | — | Official Arabic name (ADR-005 bilingual) |
| `name_en` | string | — | Latin name |
| `nationality` | ISO 3166-1 alpha-2 (string) | Qiwa | Drives Saudi/non-Saudi (Nitaqat counting) |
| `date_of_birth` ⏳ | date | Muqeem | Personal, not an identifier |
| `gender` | enum `male \| female` | — | |
| `job_title_ar` / `job_title_en` | string | — | |
| `department` | string | — | |
| `hire_date` ⏳ | date | — | |
| `employment_status` | enum (below) | — | |
| `contract_type` | enum (below) | **Qiwa** | Labor contract type |
| `contract_end_date` ⏳ | date, nullable | Qiwa | Null for unlimited contracts |
| `counts_toward_saudization` | boolean | Qiwa | Derived from nationality; per-employee Nitaqat input (Nitaqat *ratio* is a company-level concern — future client-company field) |

## Salary — `salary` (compensation + payroll)

| Field | Type / enum | Ref system | Notes |
|---|---|---|---|
| `currency` | ISO 4217 (default `SAR`) | — | |
| `basic_salary` | decimal | — | |
| `housing_allowance` | decimal | — | |
| `transport_allowance` | decimal | — | |
| `other_allowances` | decimal | — | |
| `gosi_wage` | decimal | **GOSI** | Contribution basis — **distinct from actual salary** |
| `gosi_contribution_basis` | enum `basic \| basic_plus_housing` | GOSI | |
| `bank_iban` | string (SA IBAN) | **Mudad / WPS** | Wage-protection payroll |
| `wps_status` | enum `compliant \| pending \| non_compliant` | Mudad / WPS | |

## Government data — `govdata`

### `govdata:id` — identifiers (staff only, never client-rep)

| Field | Type | Ref system | Notes |
|---|---|---|---|
| `iqama_number` | string | **Muqeem** | Non-Saudi residency id |
| `national_id` | string, nullable | Absher | Saudis (mutually exclusive with iqama) |
| `border_number` | string, nullable | **Muqeem** | |
| `passport_number` | string, nullable | Muqeem | High-sensitivity (architecture §Security) |
| `work_permit_number` | string, nullable | **Qiwa** | |
| `gosi_registration_number` | string, nullable | **GOSI** | |
| `absher_service_ref` | string, nullable | Absher Business | Connector-ready placeholder for gov service ref ids |

### `govdata:status` — expiry / status (client-rep may see for own, expiry/status only)

| Field | Type / enum | Ref system | Notes |
|---|---|---|---|
| `iqama_expiry` ⏳ | date, nullable | **Muqeem** | Expiry engine input (3.4) |
| `passport_expiry` ⏳ | date, nullable | Muqeem | |
| `work_permit_expiry` ⏳ | date, nullable | Qiwa | |
| `exit_reentry_status` | enum `none \| single \| multiple` | **Muqeem** | |
| `exit_reentry_expiry` ⏳ | date, nullable | Muqeem | |
| `gosi_registration_status` | enum `registered \| pending \| not_registered` | **GOSI** | |

---

## Enums (v1)

- **employment_status:** `active`, `on_leave`, `suspended`, `terminated`
- **contract_type** (Qiwa): `unlimited`, `fixed_term`, `part_time`, `temporary`, `seasonal`
- **gender:** `male`, `female`
- **gosi_contribution_basis:** `basic`, `basic_plus_housing`
- **wps_status:** `compliant`, `pending`, `non_compliant`
- **exit_reentry_status:** `none`, `single`, `multiple`
- **gosi_registration_status:** `registered`, `pending`, `not_registered`

## Scope notes

- **ZATCA (Fatoora) is deferred to Billing** (architecture.md — "activates with
  Billing"); no employee fields here.
- **Nitaqat** is primarily a **company-level** ratio (a future client-company
  field), not per-employee; the per-employee input is nationality →
  `counts_toward_saudization`.
- **Client-rep employee access** (core own + `govdata:status` own) is granted
  with the rep-facing/portal surface (like `client.read` was deferred to the
  Client Portal, ACTION-PLAN 5.1); EMP-01/02 build the schema + staff API +
  field-level authorization first.
- All fields are nullable in v1 except identity/employment basics
  (`name_*`, `nationality`, `employment_status`, `contract_type`) — manual
  entry is incremental.
