import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { SEED_USER_DOMAIN, seedEmailFor, seedPasswordFor, seedStorageFor, UAT_SEED_EMAILS } from './seed-guard';
import { syncSeedAccounts, type SeedAccount } from './seed-accounts';
import { buildSamplePdf, SeedFiles } from './seed-files';
import { leaveEndDate, splitByYear } from '../src/modules/leave/public-api';
import { SEQUENCES } from '../src/modules/gro/public-api';
import {
  CLIENT_ROLES,
  PasswordService,
  STAFF_ROLES,
  type StaffRole,
} from '../src/modules/auth/public-api';

// Development seed (WS-19, extended for AUTH-07). Deterministic and
// idempotent: running it twice yields the same state. The well-known IDs and
// role users below are the contract shared with the isolation harness and
// auth fixtures.

export const SEED_CLIENT_A = '11111111-1111-4111-8111-111111111111';
export const SEED_CLIENT_B = '22222222-2222-4222-8222-222222222222';
// Added in UX-07 so lists have enough rows to be worth sorting, filtering and
// paging. A and B keep their well-known ids — the isolation harness, the auth
// fixtures and several e2e specs are written against exactly those two.
//
// NOT the obvious 3333…/4444… continuation of the pattern: four e2e specs use
// `33333333-3333-4333-8333-333333333333` as their sentinel for a client that does
// NOT exist ("unknown client → 400/404"). Seeding it turned three of those
// assertions red, because the id had quietly become real. These ids are drawn
// from a different range so nothing can claim them as "absent".
export const SEED_CLIENT_C = 'c1000000-0000-4000-8000-000000000003';
export const SEED_CLIENT_D = 'c1000000-0000-4000-8000-000000000004';
export const SEED_CLIENT_E = 'c1000000-0000-4000-8000-000000000005';

// ---------------------------------------------------------------------------
// Dates are RELATIVE to the moment the seed runs (UX-07).
//
// Every date in this file used to be a literal — `new Date('2027-03-15')` —
// written when that was the near future. By July 2026 the nearest document
// expiry was 99 days out, which meant the expiry dashboard (the product's
// compliance centrepiece) demoed as three empty buckets, "Today" had nothing
// overdue, and the 60-day scan found nothing. The fixture did not break; it
// aged out, and it would have aged further every day nobody looked.
//
// Relative offsets keep the SHAPE stable instead: whenever you run the seed,
// something is overdue, something is due this week, something sits at the edge
// of the 60-day horizon. That is what makes the states reviewable without
// hand-editing rows before every demo.
// ---------------------------------------------------------------------------

/** Midnight UTC, `days` from today. Negative = in the past. */
/** Hours before now (a timestamp, for 'uploaded 6 hours ago' sample data). */
function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** `days` from today at a given UTC hour — for calendar events, which are timestamps. */
function daysFromNowAt(days: number, hour: number, minute = 0): Date {
  const d = daysFromNow(days);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

const yearsAgo = (years: number): Date => daysFromNow(-365 * years);

// Seeded principals live under this domain so cleanup is a single deleteMany
// scoped by email — never colliding with the `e2e-helper-` users the harness
// creates and cleans on its own.
export { SEED_USER_DOMAIN };

// The address a seed account signs in with: @seed.hr.local everywhere except
// UAT, where the owner chose simple @peopleandgro.com logins (UAT-01).
const seedEmail = (local: string): string => seedEmailFor(local, process.env);

// One shared password across seed users: the public dev one locally, an
// owner-generated secret on UAT, and the seed never runs on production at all
// (seed-guard.ts, GCP-06). Decided once, at load, so a refusal happens before
// anything touches the database.
const SEED_PASSWORD = seedPasswordFor(process.env);

// One client manager per seeded client (ADR-013: one client role).
const CLIENT_REP_ASSIGNMENTS: ReadonlyArray<{ clientId: string; name: string }> = [
  { clientId: SEED_CLIENT_A, name: 'Abdulaziz Al-Ghamdi' },
  { clientId: SEED_CLIENT_B, name: 'Reem Al-Mutairi' },
];

const clientLetter = (clientId: string): string =>
  clientId === SEED_CLIENT_A ? 'a' : 'b';

// The seeded staff (UX-10b names), one account per person. ROLE-03 (ADR-013)
// kept every person and gave them their new role — exactly what the migration
// did to existing accounts — so tasks and calendar events stay spread across
// five owners. The first account of each role keeps the `staff-<role>@` address
// sign-in instructions rely on; further holders of a role are numbered.
const STAFF_ACCOUNTS: ReadonlyArray<{ email: string; role: StaffRole; name: string }> = [
  { email: 'staff-administrator', role: 'administrator', name: 'Faisal Al-Otaibi' },
  { email: 'staff-administrator-2', role: 'administrator', name: 'Layla Al-Rashid' },
  { email: 'staff-hr_officer', role: 'hr_officer', name: 'Omar Al-Shehri' },
  // Formerly the Recruiter and Finance seats (ADR-013: both → HR officer).
  { email: 'staff-hr_officer-2', role: 'hr_officer', name: 'Huda Al-Qahtani' },
  { email: 'staff-hr_officer-3', role: 'hr_officer', name: 'Maha Al-Dossary' },
  { email: 'staff-gro_officer', role: 'gro_officer', name: 'Turki Al-Harbi' },
  { email: 'staff-auditor', role: 'auditor', name: 'Sami Al-Zahrani' },
];

// The employee record the seed's employee account is bound to (SS-01).
const SEED_EMPLOYEE_USER_RECORD = 'e0000001-0000-4000-8000-000000000002';

async function seedUsers(prisma: PrismaClient): Promise<number> {
  const passwords = new PasswordService();

  // Every staff account + one client manager per seeded client. The
  // MFA-required roles (Administrator, Auditor — ADR-013) are seeded WITHOUT an
  // mfa_secret: they sign in to an enroll-required session until they enroll,
  // exactly as AUTH-06 requires; the seed never fakes enrollment.
  const staffUsers: SeedAccount[] = await Promise.all(
    STAFF_ACCOUNTS.map(async ({ email, role, name }) => ({
      email: seedEmail(email),
      passwordHash: await passwords.hash(SEED_PASSWORD),
      principalType: 'staff' as const,
      role,
      displayName: name,
    })),
  );

  const clientRepUsers: SeedAccount[] = await Promise.all(
    CLIENT_REP_ASSIGNMENTS.map(async ({ clientId, name }) => ({
      email: seedEmail(`client_manager-${clientLetter(clientId)}`),
      passwordHash: await passwords.hash(SEED_PASSWORD),
      principalType: 'client_rep' as const,
      role: 'client_manager' as const,
      clientId,
      displayName: name,
    })),
  );

  // SS-01 (ADR-011): one employee account, bound to Ahmed Hassan (client A) —
  // a seed employee who already has documents and a request, so the self-
  // service cards (SS-02..) have real own-data to fence and real colleagues'
  // data to fence OUT. No client_id: an employee's company is read from the
  // record (auth_users_principal_binding_chk forbids storing one). It holds no
  // permissions until SS-03, so it can sign in and do nothing else.
  const employeeUsers: SeedAccount[] = [
    {
      email: seedEmail('employee-a'),
      passwordHash: await passwords.hash(SEED_PASSWORD),
      principalType: 'employee' as const,
      role: 'employee' as const,
      employeeId: SEED_EMPLOYEE_USER_RECORD,
      displayName: 'Ahmed Hassan',
    },
  ];

  const data = [...staffUsers, ...clientRepUsers, ...employeeUsers];

  // SEED-02: the accounts are kept IN PLACE (matched by email), so re-seeding
  // never changes an account's id and a session opened before it is still that
  // person. Seed-owned means the seed's own email domain — and, on UAT, EXACTLY
  // the seed's addresses at the company domain, never another account there.
  await syncSeedAccounts(prisma, data, {
    OR: [
      { email: { endsWith: `@${SEED_USER_DOMAIN}` } },
      { email: { in: Object.values(UAT_SEED_EMAILS) } },
    ],
  });

  return data.length;
}

// CLIENT-01: the two seed client companies. Their ids are the well-known
// SEED_CLIENT_A/B used everywhere (client-rep users, scope-check rows), so the
// registry and everything referencing a client_id stay consistent. Upsert by
// id keeps it idempotent without disturbing manually-created clients.
async function seedClients(prisma: PrismaClient): Promise<number> {
  const clients = [
    { id: SEED_CLIENT_A, nameAr: 'شركة الألف التجارية', nameEn: 'Alpha Trading Co.', status: 'active' as const },
    { id: SEED_CLIENT_B, nameAr: 'مؤسسة الباء للمقاولات', nameEn: 'Beta Contracting Est.', status: 'active' as const },
    { id: SEED_CLIENT_C, nameAr: 'شركة نجد للخدمات اللوجستية', nameEn: 'Najd Logistics Co.', status: 'active' as const },
    { id: SEED_CLIENT_D, nameAr: 'مجموعة الخليج الطبية', nameEn: 'Gulf Medical Group', status: 'active' as const },
    // One archived client on purpose: the clients console has a status column and
    // an archive action, and neither is reviewable when every row is active.
    { id: SEED_CLIENT_E, nameAr: 'مؤسسة الواحة للتجارة', nameEn: 'Al Waha Trading Est.', status: 'inactive' as const },
  ];
  for (const c of clients) {
    await prisma.client.upsert({
      where: { id: c.id },
      create: { id: c.id, nameAr: c.nameAr, nameEn: c.nameEn, status: c.status },
      update: { nameAr: c.nameAr, nameEn: c.nameEn, status: c.status },
    });
  }
  return clients.length;
}

// EMP-01 + UX-07. Forty employees across the five clients, spanning the
// sensitivity groups (Saudi with national id; non-Saudi with iqama/work permit
// and expiries) and every employment status.
//
// Volume is deliberate: the first page size is 25, so with four employees
// nothing about search, sorting or pagination could be judged — and the Arabic
// search normaliser could not be exercised against real Arabic job titles,
// because `job_title_ar` was empty on three of the four rows.
//
// IQAMA EXPIRIES ARE SPREAD ACROSS THE ALERT TIERS on purpose: some already
// expired, some inside a week, some inside a month, most far out. The compliance
// screens are the product; they cannot be reviewed against a clean sheet.
interface EmpSpec {
  ar: string;
  en: string;
  nat: string;
  dept: string;
  jobAr: string;
  jobEn: string;
  salary: number;
  /** Days from today; omitted for Saudi nationals (no iqama). */
  iqama?: number;
  status?: 'active' | 'on_leave' | 'suspended' | 'terminated';
  gender?: 'male' | 'female';
  contract?: 'unlimited' | 'fixed_term';
  hiredYearsAgo?: number;
}

const EMPLOYEES: ReadonlyArray<readonly [client: string, id: string, spec: EmpSpec]> = [
  // ---- Client A — Alpha Trading (keeps the two original ids) ----
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000001', { ar: 'محمد العبدالله', en: 'Mohammed Alabdullah', nat: 'SA', dept: 'Operations', jobAr: 'مشرف موقع', jobEn: 'Site Supervisor', salary: 9000, hiredYearsAgo: 5 }],
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000002', { ar: 'أحمد حسن', en: 'Ahmed Hassan', nat: 'EG', dept: 'Finance', jobAr: 'محاسب', jobEn: 'Accountant', salary: 7000, iqama: 24, contract: 'fixed_term', hiredYearsAgo: 3 }],
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000003', { ar: 'فاطمة الزهراني', en: 'Fatimah Alzahrani', nat: 'SA', dept: 'Human Resources', jobAr: 'أخصائية موارد بشرية', jobEn: 'HR Specialist', salary: 11000, gender: 'female', hiredYearsAgo: 2 }],
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000004', { ar: 'سيد علي', en: 'Syed Ali', nat: 'PK', dept: 'Warehouse', jobAr: 'أمين مستودع', jobEn: 'Storekeeper', salary: 4200, iqama: -8, hiredYearsAgo: 4 }],
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000005', { ar: 'خالد المطيري', en: 'Khalid Almutairi', nat: 'SA', dept: 'Sales', jobAr: 'مدير مبيعات', jobEn: 'Sales Manager', salary: 16000, hiredYearsAgo: 7 }],
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000006', { ar: 'جوزيف سانتوس', en: 'Joseph Santos', nat: 'PH', dept: 'Maintenance', jobAr: 'فني تكييف', jobEn: 'HVAC Technician', salary: 4800, iqama: 5, hiredYearsAgo: 2 }],
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000007', { ar: 'نورة السبيعي', en: 'Noura Alsubaie', nat: 'SA', dept: 'Finance', jobAr: 'محاسبة', jobEn: 'Accountant', salary: 9500, gender: 'female', hiredYearsAgo: 1 }],
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000008', { ar: 'محمود عبد الرحمن', en: 'Mahmoud Abdelrahman', nat: 'SD', dept: 'Operations', jobAr: 'سائق', jobEn: 'Driver', salary: 3600, iqama: 41, hiredYearsAgo: 6 }],
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000009', { ar: 'عبد الله القحطاني', en: 'Abdullah Alqahtani', nat: 'SA', dept: 'IT', jobAr: 'مهندس دعم فني', jobEn: 'Support Engineer', salary: 13000, hiredYearsAgo: 3 }],
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000010', { ar: 'ريما الشمري', en: 'Reema Alshammari', nat: 'SA', dept: 'Human Resources', jobAr: 'منسقة توظيف', jobEn: 'Recruitment Coordinator', salary: 8500, gender: 'female', status: 'on_leave', hiredYearsAgo: 2 }],
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000011', { ar: 'راشد اليامي', en: 'Rashed Alyami', nat: 'SA', dept: 'Operations', jobAr: 'منسق عمليات', jobEn: 'Operations Coordinator', salary: 8000, status: 'terminated', hiredYearsAgo: 4 }],
  [SEED_CLIENT_A, 'e0000001-0000-4000-8000-000000000012', { ar: 'إبراهيم دياب', en: 'Ibrahim Diab', nat: 'JO', dept: 'Finance', jobAr: 'محلل مالي', jobEn: 'Financial Analyst', salary: 12500, iqama: 180, hiredYearsAgo: 1 }],

  // ---- Client B — Beta Contracting (keeps the original id) ----
  [SEED_CLIENT_B, 'e0000002-0000-4000-8000-000000000001', { ar: 'راجيش كومار', en: 'Rajesh Kumar', nat: 'IN', dept: 'Maintenance', jobAr: 'كهربائي', jobEn: 'Electrician', salary: 4500, iqama: 97, hiredYearsAgo: 3 }],
  [SEED_CLIENT_B, 'e0000002-0000-4000-8000-000000000002', { ar: 'سلمان الغامدي', en: 'Salman Alghamdi', nat: 'SA', dept: 'Projects', jobAr: 'مهندس مدني', jobEn: 'Civil Engineer', salary: 18000, hiredYearsAgo: 6 }],
  [SEED_CLIENT_B, 'e0000002-0000-4000-8000-000000000003', { ar: 'محمد رحمن', en: 'Mohammed Rahman', nat: 'BD', dept: 'Projects', jobAr: 'عامل بناء', jobEn: 'Construction Worker', salary: 2800, iqama: -3, hiredYearsAgo: 2 }],
  [SEED_CLIENT_B, 'e0000002-0000-4000-8000-000000000004', { ar: 'أنيل ثوماس', en: 'Anil Thomas', nat: 'IN', dept: 'Projects', jobAr: 'مساح', jobEn: 'Surveyor', salary: 6200, iqama: 12, hiredYearsAgo: 4 }],
  [SEED_CLIENT_B, 'e0000002-0000-4000-8000-000000000005', { ar: 'سعد الدوسري', en: 'Saad Aldosari', nat: 'SA', dept: 'Safety', jobAr: 'مسؤول سلامة', jobEn: 'Safety Officer', salary: 10500, hiredYearsAgo: 2 }],
  [SEED_CLIENT_B, 'e0000002-0000-4000-8000-000000000006', { ar: 'كمال الدين', en: 'Kamal Uddin', nat: 'BD', dept: 'Maintenance', jobAr: 'سباك', jobEn: 'Plumber', salary: 3200, iqama: 33, hiredYearsAgo: 5 }],
  [SEED_CLIENT_B, 'e0000002-0000-4000-8000-000000000007', { ar: 'يوسف الحربي', en: 'Yousef Alharbi', nat: 'SA', dept: 'Projects', jobAr: 'مدير مشروع', jobEn: 'Project Manager', salary: 22000, hiredYearsAgo: 8 }],
  [SEED_CLIENT_B, 'e0000002-0000-4000-8000-000000000008', { ar: 'أروى الشهري', en: 'Arwa Alshehri', nat: 'SA', dept: 'Administration', jobAr: 'سكرتيرة تنفيذية', jobEn: 'Executive Secretary', salary: 7500, gender: 'female', hiredYearsAgo: 1 }],
  [SEED_CLIENT_B, 'e0000002-0000-4000-8000-000000000009', { ar: 'حسن اليمني', en: 'Hassan Alyamani', nat: 'YE', dept: 'Warehouse', jobAr: 'مشغل رافعة', jobEn: 'Forklift Operator', salary: 3400, iqama: 51, status: 'suspended', hiredYearsAgo: 3 }],

  // ---- Client C — Najd Logistics ----
  [SEED_CLIENT_C, 'e0000003-0000-4000-8000-000000000001', { ar: 'بدر العتيبي', en: 'Badr Alotaibi', nat: 'SA', dept: 'Logistics', jobAr: 'مدير أسطول', jobEn: 'Fleet Manager', salary: 15000, hiredYearsAgo: 4 }],
  [SEED_CLIENT_C, 'e0000003-0000-4000-8000-000000000002', { ar: 'شاه محمد', en: 'Shah Mohammed', nat: 'PK', dept: 'Logistics', jobAr: 'سائق شاحنة', jobEn: 'Truck Driver', salary: 3900, iqama: 2, hiredYearsAgo: 3 }],
  [SEED_CLIENT_C, 'e0000003-0000-4000-8000-000000000003', { ar: 'عمر الشريف', en: 'Omar Alsharif', nat: 'EG', dept: 'Logistics', jobAr: 'منسق شحن', jobEn: 'Shipping Coordinator', salary: 6800, iqama: 58, hiredYearsAgo: 2 }],
  [SEED_CLIENT_C, 'e0000003-0000-4000-8000-000000000004', { ar: 'منى الرشيد', en: 'Muna Alrashid', nat: 'SA', dept: 'Administration', jobAr: 'محاسبة تكاليف', jobEn: 'Cost Accountant', salary: 10000, gender: 'female', hiredYearsAgo: 2 }],
  [SEED_CLIENT_C, 'e0000003-0000-4000-8000-000000000005', { ar: 'سانجاي باتيل', en: 'Sanjay Patel', nat: 'IN', dept: 'Warehouse', jobAr: 'مشرف مستودع', jobEn: 'Warehouse Supervisor', salary: 5600, iqama: 140, hiredYearsAgo: 5 }],
  [SEED_CLIENT_C, 'e0000003-0000-4000-8000-000000000006', { ar: 'طارق الأنصاري', en: 'Tariq Alansari', nat: 'SA', dept: 'Logistics', jobAr: 'مخطط توزيع', jobEn: 'Distribution Planner', salary: 9800, hiredYearsAgo: 1 }],
  [SEED_CLIENT_C, 'e0000003-0000-4000-8000-000000000007', { ar: 'مانويل كروز', en: 'Manuel Cruz', nat: 'PH', dept: 'Maintenance', jobAr: 'ميكانيكي', jobEn: 'Mechanic', salary: 4400, iqama: 19, hiredYearsAgo: 4 }],
  [SEED_CLIENT_C, 'e0000003-0000-4000-8000-000000000008', { ar: 'لمياء الحمد', en: 'Lamia Alhamad', nat: 'SA', dept: 'Human Resources', jobAr: 'أخصائية رواتب', jobEn: 'Payroll Specialist', salary: 9200, gender: 'female', hiredYearsAgo: 3 }],

  // ---- Client D — Gulf Medical ----
  [SEED_CLIENT_D, 'e0000004-0000-4000-8000-000000000001', { ar: 'سارة النعيمي', en: 'Sarah Alnuaimi', nat: 'SA', dept: 'Clinical', jobAr: 'ممرضة', jobEn: 'Registered Nurse', salary: 12000, gender: 'female', hiredYearsAgo: 3 }],
  [SEED_CLIENT_D, 'e0000004-0000-4000-8000-000000000002', { ar: 'ريتا خوري', en: 'Rita Khoury', nat: 'LB', dept: 'Clinical', jobAr: 'أخصائية مختبر', jobEn: 'Lab Technician', salary: 9500, gender: 'female', iqama: 7, hiredYearsAgo: 2 }],
  [SEED_CLIENT_D, 'e0000004-0000-4000-8000-000000000003', { ar: 'فيصل الزامل', en: 'Faisal Alzamil', nat: 'SA', dept: 'Administration', jobAr: 'مدير إداري', jobEn: 'Administration Manager', salary: 17000, hiredYearsAgo: 6 }],
  [SEED_CLIENT_D, 'e0000004-0000-4000-8000-000000000004', { ar: 'براديب ناير', en: 'Pradeep Nair', nat: 'IN', dept: 'Clinical', jobAr: 'فني أشعة', jobEn: 'Radiology Technician', salary: 8800, iqama: 27, hiredYearsAgo: 4 }],
  [SEED_CLIENT_D, 'e0000004-0000-4000-8000-000000000005', { ar: 'هند العنزي', en: 'Hind Alanazi', nat: 'SA', dept: 'Reception', jobAr: 'موظفة استقبال', jobEn: 'Receptionist', salary: 6000, gender: 'female', hiredYearsAgo: 1 }],
  [SEED_CLIENT_D, 'e0000004-0000-4000-8000-000000000006', { ar: 'أحمد الطيب', en: 'Ahmed Eltayeb', nat: 'SD', dept: 'Facilities', jobAr: 'مشرف نظافة', jobEn: 'Housekeeping Supervisor', salary: 3800, iqama: 64, hiredYearsAgo: 5 }],
  [SEED_CLIENT_D, 'e0000004-0000-4000-8000-000000000007', { ar: 'مريم الفهد', en: 'Mariam Alfahad', nat: 'SA', dept: 'Clinical', jobAr: 'صيدلانية', jobEn: 'Pharmacist', salary: 14500, gender: 'female', hiredYearsAgo: 2 }],

  // ---- Client E — Al Waha (archived client, still has records) ----
  [SEED_CLIENT_E, 'e0000005-0000-4000-8000-000000000001', { ar: 'ماجد البلوي', en: 'Majed Albalawi', nat: 'SA', dept: 'Sales', jobAr: 'مندوب مبيعات', jobEn: 'Sales Representative', salary: 7200, status: 'terminated', hiredYearsAgo: 3 }],
  [SEED_CLIENT_E, 'e0000005-0000-4000-8000-000000000002', { ar: 'نبيل حداد', en: 'Nabil Haddad', nat: 'SY', dept: 'Operations', jobAr: 'منسق عمليات', jobEn: 'Operations Coordinator', salary: 5800, iqama: 220, status: 'terminated', hiredYearsAgo: 4 }],
  [SEED_CLIENT_E, 'e0000005-0000-4000-8000-000000000003', { ar: 'عادل السالم', en: 'Adel Alsalem', nat: 'SA', dept: 'Administration', jobAr: 'كاتب', jobEn: 'Clerk', salary: 5000, hiredYearsAgo: 2 }],
];

// INS-03: medical insurance and driving licence, as DAYS FROM TODAY, for the
// people who put them on every stage of the notification ladder (thresholds
// 30 / 14 / 7, then lapsed). Everyone else in post gets an insurance date well
// outside the window (derived from their id, so it is stable across runs) and no
// licence — most people's licence is no business of their employer's file.
const INSURANCE_LICENCE: Readonly<Record<string, { insurance?: number; licence?: number }>> = {
  'e0000001-0000-4000-8000-000000000002': { insurance: 10, licence: 420 }, // Ahmed Hassan — Reminder
  'e0000001-0000-4000-8000-000000000004': { insurance: -4 }, // Syed Ali — lapsed
  'e0000001-0000-4000-8000-000000000006': { insurance: 5 }, // Joseph Santos — Escalated
  'e0000001-0000-4000-8000-000000000008': { insurance: 200, licence: 21 }, // Mahmoud Abdelrahman (driver) — licence at Notice
  'e0000002-0000-4000-8000-000000000001': { insurance: 27 }, // Rajesh Kumar — Notice
  'e0000002-0000-4000-8000-000000000009': { insurance: 120, licence: 9 }, // Hassan Alyamani (forklift) — licence at Reminder
  'e0000003-0000-4000-8000-000000000001': { insurance: 300, licence: 900 }, // Badr Alotaibi (fleet manager)
  'e0000003-0000-4000-8000-000000000002': { insurance: 150, licence: -6 }, // Shah Mohammed (truck driver) — licence lapsed
};

async function seedEmployees(prisma: PrismaClient): Promise<number> {
  let n = 0;
  for (const [clientId, id, e] of EMPLOYEES) {
    const saudi = e.nat === 'SA';
    // Identifier shapes follow the real ones: a national id starts with 1, an
    // iqama with 2. Derived from the row id so they stay stable across runs.
    const serial = id.slice(-6);
    // Insurance for everyone still in post; a licence only where one is named.
    // All four columns are written on EVERY run (null where there is none), so a
    // re-seed puts back whatever a walk-through changed.
    const doc = INSURANCE_LICENCE[id] ?? {};
    const inPost = (e.status ?? 'active') !== 'terminated';
    const idNumber = Number(id.slice(4, 8)) * 100 + Number(id.slice(-2));
    const insuranceIn = doc.insurance ?? (inPost ? 45 + ((idNumber * 37) % 300) : undefined);
    const rest = {
      medicalInsuranceNumber: insuranceIn === undefined ? null : `POL-${id.slice(4, 8)}-${serial}`,
      medicalInsuranceExpiry: insuranceIn === undefined ? null : daysFromNow(insuranceIn),
      drivingLicenceNumber: doc.licence === undefined ? null : `DL-${id.slice(4, 8)}-${serial}`,
      drivingLicenceExpiry: doc.licence === undefined ? null : daysFromNow(doc.licence),
      clientId,
      nameAr: e.ar,
      nameEn: e.en,
      nationality: e.nat,
      gender: (e.gender ?? 'male') as 'male' | 'female',
      department: e.dept,
      jobTitleAr: e.jobAr,
      jobTitleEn: e.jobEn,
      hireDate: yearsAgo(e.hiredYearsAgo ?? 2),
      contractType: (e.contract ?? 'unlimited') as 'unlimited' | 'fixed_term',
      employmentStatus: (e.status ?? 'active') as 'active' | 'on_leave' | 'suspended' | 'terminated',
      countsTowardSaudization: saudi,
      basicSalary: e.salary,
      housingAllowance: Math.round(e.salary * 0.25),
      gosiRegistrationStatus: (saudi ? 'registered' : e.iqama !== undefined && e.iqama < 0 ? 'pending' : 'registered') as 'registered' | 'pending',
      wpsStatus: 'compliant' as const,
      ...(saudi
        ? { nationalId: `1${serial}0000`.slice(0, 10) }
        : {
            iqamaNumber: `2${serial}0000`.slice(0, 10),
            workPermitNumber: `WP-${serial}`,
            ...(e.iqama !== undefined
              ? { iqamaExpiry: daysFromNow(e.iqama), workPermitExpiry: daysFromNow(e.iqama) }
              : {}),
            exitReentryStatus: 'none' as const,
          }),
    };
    await prisma.employee.upsert({ where: { id }, create: { id, ...rest }, update: rest });
    n += 1;
  }
  return n;
}

// DOC-01 + UX-07. Metadata-only fixtures (the blob layer is exercised by the
// upload flow) whose expiryDate spans EVERY tier the alert engine knows about:
// already expired, ≤1d, ≤7d, ≤14d, ≤30d, ≤60d, and comfortably beyond.
//
// This is the point of the whole card. The engine's six thresholds and the UI's
// three severities (Critical / Action / Watch) were both unreviewable against a
// dataset whose nearest expiry was 99 days away.
const DOCUMENTS: ReadonlyArray<{
  id: string;
  client: string;
  employee: string;
  category: 'iqama' | 'passport' | 'visa' | 'contract' | 'gosi' | 'national_id' | 'cv' | 'other';
  titleEn: string;
  /** Days from today. Negative = already expired. */
  expiry: number | null;
}> = [
  // --- expired: the state nobody had ever seen on this screen ---
  { id: 'd0000001-0000-4000-8000-000000000010', client: SEED_CLIENT_A, employee: 'e0000001-0000-4000-8000-000000000004', category: 'iqama', titleEn: 'Iqama — Syed Ali', expiry: -8 },
  { id: 'd0000002-0000-4000-8000-000000000010', client: SEED_CLIENT_B, employee: 'e0000002-0000-4000-8000-000000000003', category: 'iqama', titleEn: 'Iqama — Mohammed Rahman', expiry: -3 },
  { id: 'd0000004-0000-4000-8000-000000000010', client: SEED_CLIENT_D, employee: 'e0000004-0000-4000-8000-000000000002', category: 'visa', titleEn: 'Work Visa — Rita Khoury', expiry: -1 },
  // --- critical: today / tomorrow ---
  { id: 'd0000003-0000-4000-8000-000000000010', client: SEED_CLIENT_C, employee: 'e0000003-0000-4000-8000-000000000002', category: 'iqama', titleEn: 'Iqama — Shah Mohammed', expiry: 1 },
  // --- action: inside a fortnight ---
  { id: 'd0000001-0000-4000-8000-000000000011', client: SEED_CLIENT_A, employee: 'e0000001-0000-4000-8000-000000000006', category: 'iqama', titleEn: 'Iqama — Joseph Santos', expiry: 5 },
  { id: 'd0000004-0000-4000-8000-000000000011', client: SEED_CLIENT_D, employee: 'e0000004-0000-4000-8000-000000000002', category: 'iqama', titleEn: 'Iqama — Rita Khoury', expiry: 7 },
  { id: 'd0000002-0000-4000-8000-000000000011', client: SEED_CLIENT_B, employee: 'e0000002-0000-4000-8000-000000000004', category: 'iqama', titleEn: 'Iqama — Anil Thomas', expiry: 12 },
  { id: 'd0000003-0000-4000-8000-000000000011', client: SEED_CLIENT_C, employee: 'e0000003-0000-4000-8000-000000000007', category: 'passport', titleEn: 'Passport — Manuel Cruz', expiry: 19 },
  // --- watch: the 30–60 day horizon (grey, no email) ---
  { id: 'd0000001-0000-4000-8000-000000000002', client: SEED_CLIENT_A, employee: 'e0000001-0000-4000-8000-000000000002', category: 'contract', titleEn: 'Employment Contract — Ahmed Hassan', expiry: 24 },
  { id: 'd0000004-0000-4000-8000-000000000012', client: SEED_CLIENT_D, employee: 'e0000004-0000-4000-8000-000000000004', category: 'iqama', titleEn: 'Iqama — Pradeep Nair', expiry: 27 },
  { id: 'd0000002-0000-4000-8000-000000000012', client: SEED_CLIENT_B, employee: 'e0000002-0000-4000-8000-000000000006', category: 'iqama', titleEn: 'Iqama — Kamal Uddin', expiry: 33 },
  { id: 'd0000001-0000-4000-8000-000000000012', client: SEED_CLIENT_A, employee: 'e0000001-0000-4000-8000-000000000008', category: 'iqama', titleEn: 'Iqama — Mahmoud Abdelrahman', expiry: 41 },
  { id: 'd0000002-0000-4000-8000-000000000013', client: SEED_CLIENT_B, employee: 'e0000002-0000-4000-8000-000000000009', category: 'iqama', titleEn: 'Iqama — Hassan Alyamani', expiry: 51 },
  { id: 'd0000003-0000-4000-8000-000000000012', client: SEED_CLIENT_C, employee: 'e0000003-0000-4000-8000-000000000003', category: 'iqama', titleEn: 'Iqama — Omar Alsharif', expiry: 58 },
  // --- beyond the horizon: the majority, as in a real book of business ---
  { id: 'd0000004-0000-4000-8000-000000000013', client: SEED_CLIENT_D, employee: 'e0000004-0000-4000-8000-000000000006', category: 'iqama', titleEn: 'Iqama — Ahmed Eltayeb', expiry: 64 },
  { id: 'd0000002-0000-4000-8000-000000000001', client: SEED_CLIENT_B, employee: 'e0000002-0000-4000-8000-000000000001', category: 'iqama', titleEn: 'Iqama — Rajesh Kumar', expiry: 97 },
  { id: 'd0000003-0000-4000-8000-000000000013', client: SEED_CLIENT_C, employee: 'e0000003-0000-4000-8000-000000000005', category: 'iqama', titleEn: 'Iqama — Sanjay Patel', expiry: 140 },
  { id: 'd0000001-0000-4000-8000-000000000001', client: SEED_CLIENT_A, employee: 'e0000001-0000-4000-8000-000000000002', category: 'iqama', titleEn: 'Iqama — Ahmed Hassan', expiry: 24 },
  // --- no expiry at all: the column has to render an absence too ---
  { id: 'd0000001-0000-4000-8000-000000000013', client: SEED_CLIENT_A, employee: 'e0000001-0000-4000-8000-000000000003', category: 'gosi', titleEn: 'GOSI Certificate — Fatimah Alzahrani', expiry: null },
  { id: 'd0000003-0000-4000-8000-000000000014', client: SEED_CLIENT_C, employee: 'e0000003-0000-4000-8000-000000000001', category: 'other', titleEn: 'Fleet Insurance Policy', expiry: 300 },
];

async function seedDocuments(prisma: PrismaClient, files: SeedFiles): Promise<number> {
  for (const d of DOCUMENTS) {
    const fileName = `${d.category}-${d.id.slice(-4)}.pdf`;
    // SEED-01: a real file behind every seeded document (it used to be a row
    // pointing at nothing — Download answered NoSuchKey on seed data).
    const pdf = samplePdf(d.titleEn, d.category);
    const rest = {
      clientId: d.client,
      employeeId: d.employee,
      category: d.category,
      title: d.titleEn,
      fileName,
      contentType: 'application/pdf',
      status: 'available' as const,
      issueDate: yearsAgo(2),
      expiryDate: d.expiry === null ? null : daysFromNow(d.expiry),
      sizeBytes: pdf.length,
    };
    const storageKey = `clients/${d.client}/documents/${d.id}/${fileName}`;
    await files.put(storageKey, pdf);
    await prisma.document.upsert({
      where: { id: d.id },
      create: { id: d.id, storageKey, ...rest },
      update: { storageKey, ...rest },
    });
  }
  return DOCUMENTS.length;
}

function samplePdf(title: string, kind: string): Buffer {
  return buildSamplePdf([
    'PEOPLE&GRO - sample document',
    title,
    `Type: ${kind}`,
    'Sample data - not a real document.',
  ]);
}

// SEED-01: two files on the seeded requests' threads (THREAD-02), so the
// Attachments block isn't empty on UAT — the client manager's bank template on
// the salary certificate, and the GRO officer's Absher receipt on the iqama
// renewal. Re-seeding removes EVERY file on the seeded requests (rows + blobs),
// as it does their comments, then writes these two again.
const SEED_REQUEST_IDS = [
  'a0000001-0000-4000-8000-000000000001',
  'a0000001-0000-4000-8000-000000000002',
  'a0000001-0000-4000-8000-000000000003',
  'a0000001-0000-4000-8000-000000000004',
  'a0000001-0000-4000-8000-000000000005',
  'a0000002-0000-4000-8000-000000000001',
  'a0000002-0000-4000-8000-000000000002',
  'a0000002-0000-4000-8000-000000000003',
  'a0000002-0000-4000-8000-000000000004',
];

async function seedRequestAttachments(prisma: PrismaClient, files: SeedFiles): Promise<number> {
  const old = await prisma.requestAttachment.findMany({ where: { requestId: { in: SEED_REQUEST_IDS } } });
  for (const a of old) await files.remove(a.storageKey).catch(() => undefined);
  await prisma.requestAttachment.deleteMany({ where: { requestId: { in: SEED_REQUEST_IDS } } });

  const repA = await prisma.authUser.findUnique({ where: { email: seedEmail('client_manager-a') } });
  const gro = await prisma.authUser.findUnique({ where: { email: seedEmail('staff-gro_officer') } });
  if (!repA || !gro) return 0;
  const samples = [
    { id: 'f0000001-0000-4000-8000-000000000001', requestId: 'a0000001-0000-4000-8000-000000000001', by: repA.id, fileName: 'Al Rajhi salary letter template.pdf', at: hoursAgo(20) },
    { id: 'f0000001-0000-4000-8000-000000000002', requestId: 'a0000001-0000-4000-8000-000000000002', by: gro.id, fileName: 'Absher receipt - iqama renewal.pdf', at: hoursAgo(6) },
  ];
  for (const f of samples) {
    const request = await prisma.request.findUniqueOrThrow({ where: { id: f.requestId } });
    const pdf = samplePdf(f.fileName.replace(/\.pdf$/, ''), 'request attachment');
    const storageKey = `clients/${request.clientId}/requests/${request.id}/${f.id}`;
    await files.put(storageKey, pdf);
    await prisma.requestAttachment.create({
      data: {
        id: f.id,
        requestId: request.id,
        clientId: request.clientId,
        requesterEmployeeId: request.requesterEmployeeId,
        uploadedByUserId: f.by,
        fileName: f.fileName,
        contentType: 'application/pdf',
        sizeBytes: pdf.length,
        storageKey,
        status: 'available',
        createdAt: f.at,
        confirmedAt: f.at,
      },
    });
  }
  return samples.length;
}

async function seedRequests(prisma: PrismaClient): Promise<number> {
  // Client-facing workflow requests (REQ-01), attributed to the seeded client
  // reps. Due dates are relative, and SOME ARE IN THE PAST — an ops console with
  // nothing overdue cannot show what it is for.
  const repA = await prisma.authUser.findUnique({
    where: { email: seedEmail('client_manager-a') },
  });
  const repB = await prisma.authUser.findUnique({
    where: { email: seedEmail('client_manager-b') },
  });
  if (!repA || !repB) return 0; // reps not seeded → skip

  const requests = [
    { id: 'a0000001-0000-4000-8000-000000000001', clientId: SEED_CLIENT_A, type: 'letter' as const, title: 'Salary certificate for Ahmed Hassan', description: 'Please issue a salary certificate addressed to the bank.', priority: 'normal' as const, status: 'open' as const, dueDate: daysFromNow(-4), createdByUserId: repA.id },
    { id: 'a0000001-0000-4000-8000-000000000002', clientId: SEED_CLIENT_A, type: 'gro_service' as const, title: 'Iqama renewal — Ahmed Hassan', priority: 'high' as const, status: 'in_progress' as const, dueDate: daysFromNow(3), createdByUserId: repA.id },
    { id: 'a0000001-0000-4000-8000-000000000003', clientId: SEED_CLIENT_A, type: 'document' as const, title: 'Onboarding pack — Noura Alsubaie', priority: 'normal' as const, status: 'resolved' as const, dueDate: daysFromNow(-20), createdByUserId: repA.id },
    { id: 'a0000001-0000-4000-8000-000000000004', clientId: SEED_CLIENT_A, type: 'general' as const, title: 'Payroll correction — August overtime', description: 'Overtime hours for the warehouse team were understated.', priority: 'high' as const, status: 'open' as const, dueDate: daysFromNow(1), createdByUserId: repA.id },
    { id: 'a0000001-0000-4000-8000-000000000005', clientId: SEED_CLIENT_A, type: 'general' as const, title: 'Update commercial registration copy', priority: 'low' as const, status: 'closed' as const, dueDate: daysFromNow(-45), createdByUserId: repA.id },
    { id: 'a0000002-0000-4000-8000-000000000001', clientId: SEED_CLIENT_B, type: 'certificate' as const, title: 'Employment letter — Rajesh Kumar', priority: 'normal' as const, status: 'open' as const, dueDate: daysFromNow(2), createdByUserId: repB.id },
    { id: 'a0000002-0000-4000-8000-000000000002', clientId: SEED_CLIENT_B, type: 'gro_service' as const, title: 'Exit-reentry visa — Anil Thomas', priority: 'high' as const, status: 'in_progress' as const, dueDate: daysFromNow(-1), createdByUserId: repB.id },
    { id: 'a0000002-0000-4000-8000-000000000003', clientId: SEED_CLIENT_B, type: 'general' as const, title: 'Final settlement — site labourer', priority: 'normal' as const, status: 'cancelled' as const, dueDate: daysFromNow(-30), createdByUserId: repB.id },
    { id: 'a0000002-0000-4000-8000-000000000004', clientId: SEED_CLIENT_B, type: 'letter' as const, title: 'Bank account opening letter — Kamal Uddin', priority: 'low' as const, status: 'open' as const, dueDate: daysFromNow(14), createdByUserId: repB.id },
  ];
  for (const { id, ...rest } of requests) {
    // Reset to the seeded state — including clearing a pending "Ask for more
    // detail" (THREAD-03): the status and its return target travel together.
    await prisma.request.upsert({ where: { id }, create: { id, ...rest }, update: { ...rest, infoReturnsTo: null } });
  }

  // A short conversation on two of them (THREAD-01, ADR-016), so the thread on
  // the request screens shows something real. Replaced on every run.
  const hr = await prisma.authUser.findUnique({ where: { email: seedEmail('staff-hr_officer') } });
  const gro = await prisma.authUser.findUnique({ where: { email: seedEmail('staff-gro_officer') } });
  await prisma.requestComment.deleteMany({ where: { requestId: { in: requests.map((r) => r.id) } } });
  if (hr && gro) {
    const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000);
    const salary = 'a0000001-0000-4000-8000-000000000001';
    const iqama = 'a0000001-0000-4000-8000-000000000002';
    await prisma.requestComment.createMany({
      data: [
        { requestId: salary, clientId: SEED_CLIENT_A, authorUserId: hr.id, createdAt: at(30), body: 'Which bank is this for? Some banks want their own template, stamped by your finance team.' },
        { requestId: salary, clientId: SEED_CLIENT_A, authorUserId: repA.id, createdAt: at(26), body: 'Al Rajhi. I will upload their template today.' },
        { requestId: iqama, clientId: SEED_CLIENT_A, authorUserId: gro.id, createdAt: at(5), body: 'Muqeem renewal submitted; waiting for the fee payment to clear.' },
      ],
    });
  }
  return requests.length;
}

async function seedTasks(prisma: PrismaClient): Promise<number> {
  // Internal work items (TASK-01). Spread across SEVERAL staff plus one
  // unassigned: every seeded task used to belong to the GRO officer, so the
  // "assign to me" action and the own/assigned scope were invisible to everyone
  // else who signed in.
  const byEmail = async (email: string) =>
    (await prisma.authUser.findUnique({ where: { email: seedEmail(email) } }))?.id ?? null;
  const gro = await byEmail('staff-gro_officer');
  const hr = await byEmail('staff-hr_officer');
  const hiringLead = await byEmail('staff-hr_officer-2');
  const payrollLead = await byEmail('staff-hr_officer-3');

  const tasks = [
    { id: 'b0000001-0000-4000-8000-000000000001', clientId: SEED_CLIENT_A, requestId: 'a0000001-0000-4000-8000-000000000002', title: 'Prepare iqama renewal paperwork — Ahmed Hassan', status: 'in_progress' as const, priority: 'high' as const, dueDate: daysFromNow(2), assigneeUserId: gro },
    { id: 'b0000001-0000-4000-8000-000000000002', clientId: SEED_CLIENT_A, title: 'Quarterly GOSI reconciliation', status: 'open' as const, priority: 'normal' as const, dueDate: daysFromNow(-2), assigneeUserId: gro },
    { id: 'b0000001-0000-4000-8000-000000000003', clientId: SEED_CLIENT_A, title: 'Collect signed contract — Noura Alsubaie', status: 'done' as const, priority: 'normal' as const, dueDate: daysFromNow(-9), assigneeUserId: hr },
    { id: 'b0000001-0000-4000-8000-000000000004', clientId: SEED_CLIENT_A, title: 'Chase expired iqama — Syed Ali', status: 'open' as const, priority: 'high' as const, dueDate: daysFromNow(-5), assigneeUserId: hr },
    { id: 'b0000001-0000-4000-8000-000000000005', clientId: SEED_CLIENT_A, title: 'Schedule interviews — Senior Accountant', status: 'in_progress' as const, priority: 'normal' as const, dueDate: daysFromNow(4), assigneeUserId: hiringLead },
    { id: 'b0000002-0000-4000-8000-000000000001', clientId: SEED_CLIENT_B, title: 'WPS file upload — August', status: 'open' as const, priority: 'high' as const, dueDate: daysFromNow(1), assigneeUserId: payrollLead },
    { id: 'b0000002-0000-4000-8000-000000000002', clientId: SEED_CLIENT_B, title: 'Safety induction records — new joiners', status: 'open' as const, priority: 'low' as const, dueDate: daysFromNow(21), assigneeUserId: null },
    { id: 'b0000003-0000-4000-8000-000000000001', clientId: SEED_CLIENT_C, title: 'Fleet insurance renewal quotes', status: 'open' as const, priority: 'normal' as const, dueDate: daysFromNow(11), assigneeUserId: null },
    { id: 'b0000004-0000-4000-8000-000000000001', clientId: SEED_CLIENT_D, title: 'Nursing licence verification — Sarah Alnuaimi', status: 'in_progress' as const, priority: 'high' as const, dueDate: daysFromNow(7), assigneeUserId: hr },
    { id: 'b0000004-0000-4000-8000-000000000002', clientId: SEED_CLIENT_D, title: 'Cancelled: duplicate onboarding request', status: 'cancelled' as const, priority: 'low' as const, assigneeUserId: hr },
  ];
  for (const { id, ...rest } of tasks) {
    await prisma.task.upsert({ where: { id }, create: { id, ...rest }, update: rest });
  }
  return tasks.length;
}

async function seedVacancies(prisma: PrismaClient): Promise<number> {
  // Open positions (REC-01), across EVERY status so the workflow control has
  // legal moves to offer and the pipeline board has more than one lane in play.
  const hiringLead = await prisma.authUser.findUnique({
    where: { email: seedEmail('staff-hr_officer-2') },
  });
  const by = hiringLead?.id ?? null;
  const vacancies = [
    { id: 'c0000001-0000-4000-8000-000000000001', clientId: SEED_CLIENT_A, titleAr: 'محاسب أول', titleEn: 'Senior Accountant', description: 'Finance department hire for the Riyadh office.', department: 'Finance', headcount: 1, status: 'open' as const, openedByUserId: by },
    { id: 'c0000001-0000-4000-8000-000000000002', clientId: SEED_CLIENT_A, titleAr: 'مشرف موقع', titleEn: 'Site Supervisor', department: 'Operations', headcount: 2, status: 'draft' as const, openedByUserId: by },
    { id: 'c0000001-0000-4000-8000-000000000003', clientId: SEED_CLIENT_A, titleAr: 'أخصائي موارد بشرية', titleEn: 'HR Specialist', department: 'Human Resources', headcount: 1, status: 'filled' as const, openedByUserId: by },
    { id: 'c0000002-0000-4000-8000-000000000001', clientId: SEED_CLIENT_B, titleAr: 'مهندس مدني', titleEn: 'Civil Engineer', department: 'Projects', headcount: 1, status: 'open' as const, openedByUserId: by },
    { id: 'c0000002-0000-4000-8000-000000000002', clientId: SEED_CLIENT_B, titleAr: 'مسؤول سلامة', titleEn: 'Safety Officer', department: 'Safety', headcount: 3, status: 'open' as const, openedByUserId: by },
    { id: 'c0000003-0000-4000-8000-000000000001', clientId: SEED_CLIENT_C, titleAr: 'سائق شاحنة', titleEn: 'Truck Driver', department: 'Logistics', headcount: 5, status: 'open' as const, openedByUserId: by },
    { id: 'c0000003-0000-4000-8000-000000000002', clientId: SEED_CLIENT_C, titleAr: 'محلل سلسلة إمداد', titleEn: 'Supply Chain Analyst', department: 'Logistics', headcount: 1, status: 'closed' as const, openedByUserId: by },
    { id: 'c0000004-0000-4000-8000-000000000001', clientId: SEED_CLIENT_D, titleAr: 'ممرضة', titleEn: 'Registered Nurse', department: 'Clinical', headcount: 4, status: 'open' as const, openedByUserId: by },
    { id: 'c0000004-0000-4000-8000-000000000002', clientId: SEED_CLIENT_D, titleAr: 'صيدلاني', titleEn: 'Pharmacist', department: 'Clinical', headcount: 1, status: 'cancelled' as const, openedByUserId: by },
  ];
  for (const { id, ...rest } of vacancies) {
    await prisma.vacancy.upsert({ where: { id }, create: { id, ...rest }, update: rest });
  }
  return vacancies.length;
}

async function seedCandidates(prisma: PrismaClient): Promise<number> {
  // Candidates (REC-03) across ALL SEVEN stages — the pipeline board is a set of
  // lanes, and with three candidates in two lanes most of it rendered empty.
  const candidates = [
    { id: 'd1000001-0000-4000-8000-000000000001', clientId: SEED_CLIENT_A, vacancyId: 'c0000001-0000-4000-8000-000000000001', nameAr: 'سالم القحطاني', nameEn: 'Salem Alqahtani', nationality: 'SA', email: 'salem.q@example.com', stage: 'screening' as const },
    { id: 'd1000001-0000-4000-8000-000000000002', clientId: SEED_CLIENT_A, vacancyId: 'c0000001-0000-4000-8000-000000000001', nameAr: 'نورة الحربي', nameEn: 'Noura Alharbi', nationality: 'SA', email: 'noura.h@example.com', stage: 'interview' as const },
    { id: 'd1000001-0000-4000-8000-000000000003', clientId: SEED_CLIENT_A, vacancyId: 'c0000001-0000-4000-8000-000000000001', nameAr: 'ياسر العمري', nameEn: 'Yasser Alamri', nationality: 'SA', email: 'yasser.a@example.com', stage: 'offer' as const },
    { id: 'd1000001-0000-4000-8000-000000000004', clientId: SEED_CLIENT_A, vacancyId: 'c0000001-0000-4000-8000-000000000001', nameAr: 'دانة الفيصل', nameEn: 'Dana Alfaisal', nationality: 'SA', email: 'dana.f@example.com', stage: 'applied' as const },
    { id: 'd1000001-0000-4000-8000-000000000005', clientId: SEED_CLIENT_A, vacancyId: 'c0000001-0000-4000-8000-000000000001', nameAr: 'وليد الشمراني', nameEn: 'Waleed Alshamrani', nationality: 'SA', email: 'waleed.s@example.com', stage: 'rejected' as const },
    { id: 'd1000002-0000-4000-8000-000000000001', clientId: SEED_CLIENT_B, vacancyId: 'c0000002-0000-4000-8000-000000000001', nameAr: 'راجيش كومار', nameEn: 'Rajesh Kumar', nationality: 'IN', email: 'rajesh.k@example.com', stage: 'applied' as const },
    { id: 'd1000002-0000-4000-8000-000000000002', clientId: SEED_CLIENT_B, vacancyId: 'c0000002-0000-4000-8000-000000000001', nameAr: 'مازن العتيبي', nameEn: 'Mazen Alotaibi', nationality: 'SA', email: 'mazen.o@example.com', stage: 'screening' as const },
    { id: 'd1000002-0000-4000-8000-000000000003', clientId: SEED_CLIENT_B, vacancyId: 'c0000002-0000-4000-8000-000000000002', nameAr: 'إيمان الدوسري', nameEn: 'Eman Aldosari', nationality: 'SA', email: 'eman.d@example.com', stage: 'withdrawn' as const },
    { id: 'd1000003-0000-4000-8000-000000000001', clientId: SEED_CLIENT_C, vacancyId: 'c0000003-0000-4000-8000-000000000001', nameAr: 'عمران خان', nameEn: 'Imran Khan', nationality: 'PK', email: 'imran.k@example.com', stage: 'interview' as const },
    { id: 'd1000004-0000-4000-8000-000000000001', clientId: SEED_CLIENT_D, vacancyId: 'c0000004-0000-4000-8000-000000000001', nameAr: 'ليلى المنصور', nameEn: 'Layla Almansour', nationality: 'SA', email: 'layla.m@example.com', stage: 'offer' as const },
    { id: 'd1000004-0000-4000-8000-000000000002', clientId: SEED_CLIENT_D, vacancyId: 'c0000004-0000-4000-8000-000000000001', nameAr: 'جراسيا ريس', nameEn: 'Gracia Reyes', nationality: 'PH', email: 'gracia.r@example.com', stage: 'screening' as const },
    // Hired, and deliberately consistent with the rest of the fixture: this is
    // the HR Specialist vacancy that shows as `filled`, and the person exists in
    // the employee table (Fatimah Alzahrani). A `hired` candidate with no
    // corresponding employee would contradict the REC-05 flow.
    { id: 'd1000001-0000-4000-8000-000000000006', clientId: SEED_CLIENT_A, vacancyId: 'c0000001-0000-4000-8000-000000000003', nameAr: 'فاطمة الزهراني', nameEn: 'Fatimah Alzahrani', nationality: 'SA', email: 'fatimah.z@example.com', stage: 'hired' as const },
  ];

  // Candidate ids moved to the d1000… range in UX-07 because the old ones
  // collided with document ids. Same rows, new keys — so the superseded ones are
  // removed rather than left behind as duplicates.
  await prisma.candidate.deleteMany({
    where: {
      id: {
        in: [
          'd0000001-0000-4000-8000-000000000001',
          'd0000001-0000-4000-8000-000000000002',
          'd0000002-0000-4000-8000-000000000001',
        ],
      },
    },
  });
  for (const { id, ...rest } of candidates) {
    // `employeeId: null` — none of these is mobilising; a re-seed must clear the
    // link a walk-through left behind (the mobilising pair is seedSequences').
    await prisma.candidate.upsert({
      where: { id },
      create: { id, ...rest },
      update: { ...rest, employeeId: null },
    });
  }
  return candidates.length;
}

// NC-06 (ADR-021): the notification centre's ladder is DERIVED from the dates
// seeded here and in the employees, dependants and requests above — there is
// no ladder data to seed. The dates are spread so that every stage of every
// rule has something in it on seed day (checked in evidence/escalations/
// NC-06.md): Reminder in particular needed a procedure due in 2 days, a
// request due in 2 days and a dependant's iqama 12 days out.
async function seedGroProcesses(prisma: PrismaClient): Promise<number> {
  // Government processes (GRO-01) across the workflow, INCLUDING overdue ones —
  // a deadline screen with everything comfortably in the future teaches nothing.
  const gro = await prisma.authUser.findUnique({
    where: { email: seedEmail('staff-gro_officer') },
  });
  const by = gro?.id ?? null;
  // INS-04: the insurance renewal belongs to an HR officer (the prototype's
  // division of labour).
  const hrOfficer = await prisma.authUser.findUnique({
    where: { email: seedEmail('staff-hr_officer') },
  });
  const processes = [
    { id: 'e1000001-0000-4000-8000-000000000001', clientId: SEED_CLIENT_A, employeeId: 'e0000001-0000-4000-8000-000000000002', type: 'iqama_renewal' as const, status: 'in_progress' as const, referenceNumber: 'MUQ-2026-00123', dueDate: daysFromNow(9), assigneeUserId: by },
    { id: 'e1000001-0000-4000-8000-000000000002', clientId: SEED_CLIENT_A, employeeId: 'e0000001-0000-4000-8000-000000000002', type: 'exit_reentry' as const, status: 'not_started' as const, dueDate: daysFromNow(25), assigneeUserId: by },
    { id: 'e1000001-0000-4000-8000-000000000003', clientId: SEED_CLIENT_A, employeeId: 'e0000001-0000-4000-8000-000000000004', type: 'iqama_renewal' as const, status: 'submitted' as const, referenceNumber: 'MUQ-2026-00871', dueDate: daysFromNow(-6), assigneeUserId: by },
    { id: 'e1000001-0000-4000-8000-000000000004', clientId: SEED_CLIENT_A, employeeId: 'e0000001-0000-4000-8000-000000000006', type: 'work_permit_renewal' as const, status: 'approved' as const, referenceNumber: 'QIWA-2026-1180', dueDate: daysFromNow(4), assigneeUserId: by },
    { id: 'e1000002-0000-4000-8000-000000000001', clientId: SEED_CLIENT_B, employeeId: 'e0000002-0000-4000-8000-000000000001', type: 'sponsorship_transfer' as const, status: 'submitted' as const, referenceNumber: 'QIWA-2026-4567', dueDate: daysFromNow(-1), assigneeUserId: by },
    { id: 'e1000002-0000-4000-8000-000000000002', clientId: SEED_CLIENT_B, employeeId: 'e0000002-0000-4000-8000-000000000003', type: 'iqama_renewal' as const, status: 'rejected' as const, referenceNumber: 'MUQ-2026-00994', dueDate: daysFromNow(-11), assigneeUserId: by },
    { id: 'e1000002-0000-4000-8000-000000000003', clientId: SEED_CLIENT_B, employeeId: 'e0000002-0000-4000-8000-000000000004', type: 'exit_reentry' as const, status: 'completed' as const, referenceNumber: 'MUQ-2026-00512', dueDate: daysFromNow(-18), resultingExpiry: daysFromNow(160), assigneeUserId: by },
    { id: 'e1000003-0000-4000-8000-000000000001', clientId: SEED_CLIENT_C, employeeId: 'e0000003-0000-4000-8000-000000000002', type: 'iqama_renewal' as const, status: 'in_progress' as const, referenceNumber: 'MUQ-2026-01204', dueDate: daysFromNow(1), assigneeUserId: by },
    { id: 'e1000004-0000-4000-8000-000000000001', clientId: SEED_CLIENT_D, employeeId: 'e0000004-0000-4000-8000-000000000002', type: 'profession_change' as const, status: 'not_started' as const, dueDate: daysFromNow(2), assigneeUserId: by },
    // INS-04: Joseph Santos's medical insurance lapses in 5 days (INS-03). Its
    // renewal is open, so that expiry is QUIET in the bell and this work item
    // carries it instead.
    { id: 'e1000001-0000-4000-8000-000000000005', clientId: SEED_CLIENT_A, employeeId: 'e0000001-0000-4000-8000-000000000006', type: 'medical_insurance_renewal' as const, status: 'in_progress' as const, referenceNumber: 'CCHI-2026-0412', dueDate: daysFromNow(3), assigneeUserId: hrOfficer?.id ?? null },
    // DEP-06b: Omar Hassan's iqama (Ahmed Hassan's son) lapses in 12 days. Its
    // renewal is open — a procedure on the SPONSOR that names the dependant — so
    // that expiry is quiet in the bell. A client manager never sees this row.
    { id: 'e1000001-0000-4000-8000-000000000006', clientId: SEED_CLIENT_A, employeeId: 'e0000001-0000-4000-8000-000000000002', type: 'dependant_iqama_renewal' as const, status: 'in_progress' as const, referenceNumber: 'MUQ-2026-D0142', dueDate: daysFromNow(10), assigneeUserId: by, dependantId: 'f2000001-0000-4000-8000-000000000002' },
  ];
  for (const { id, ...rest } of processes) {
    await prisma.groProcess.upsert({ where: { id }, create: { id, ...rest }, update: rest });
  }
  return processes.length;
}

async function seedCalendarEvents(prisma: PrismaClient): Promise<number> {
  // Staff calendar events (CAL-01), placed in the CURRENT week so the agenda and
  // "Today" have something of their own alongside the borrowed deadlines.
  const byEmail = async (email: string) =>
    (await prisma.authUser.findUnique({ where: { email: seedEmail(email) } }))?.id ?? null;
  const hiringLead = await byEmail('staff-hr_officer-2');
  const gro = await byEmail('staff-gro_officer');
  const hr = await byEmail('staff-hr_officer');
  if (!hiringLead || !gro || !hr) return 0;
  const events = [
    { id: 'f0000001-0000-4000-8000-000000000001', ownerUserId: hiringLead, clientId: SEED_CLIENT_A, title: 'Interview — Salem Alqahtani — Senior Accountant', location: 'Riyadh office — Room 2', startAt: daysFromNowAt(1, 9), endAt: daysFromNowAt(1, 10), allDay: false },
    { id: 'f0000001-0000-4000-8000-000000000002', ownerUserId: gro, clientId: SEED_CLIENT_A, title: 'Muqeem visit — iqama renewals batch', location: 'Muqeem service center', startAt: daysFromNowAt(0, 7, 30), endAt: daysFromNowAt(0, 9, 30), allDay: false },
    { id: 'f0000001-0000-4000-8000-000000000003', ownerUserId: gro, clientId: SEED_CLIENT_B, title: 'Qiwa appointment — sponsorship transfer', location: 'Qiwa service center', startAt: daysFromNowAt(2, 8), endAt: daysFromNowAt(2, 9), allDay: false },
    { id: 'f0000001-0000-4000-8000-000000000004', ownerUserId: hr, clientId: SEED_CLIENT_D, title: 'Client review — Gulf Medical Group', location: 'Client premises', startAt: daysFromNowAt(3, 11), endAt: daysFromNowAt(3, 12, 30), allDay: false },
    { id: 'f0000001-0000-4000-8000-000000000005', ownerUserId: hiringLead, clientId: SEED_CLIENT_C, title: 'Interview — Imran Khan — Truck Driver', location: 'Video call', startAt: daysFromNowAt(4, 13), endAt: daysFromNowAt(4, 14), allDay: false },
    { id: 'f0000001-0000-4000-8000-000000000006', ownerUserId: hr, title: 'Team weekly', location: 'Riyadh office — Room 1', startAt: daysFromNowAt(6, 6), endAt: daysFromNowAt(6, 7), allDay: false },
  ];
  for (const { id, ...rest } of events) {
    await prisma.calendarEvent.upsert({ where: { id }, create: { id, ...rest }, update: rest });
  }
  return events.length;
}

// UX-07: a handful of in-app notifications so the header bell has something to
// show. The bell has an unread badge, a list and a mark-read action, none of
// which could be judged against an empty panel — and after a reseed the panel is
// always empty, because recreating the seed users orphans everything addressed
// to the old ids.
async function seedNotifications(prisma: PrismaClient): Promise<number> {
  const byEmail = async (email: string) =>
    (await prisma.authUser.findUnique({ where: { email: seedEmail(email) } }))?.id ?? null;
  const hr = await byEmail('staff-hr_officer');
  const gro = await byEmail('staff-gro_officer');
  if (!hr || !gro) return 0;

  const rows = [
    { id: 'aa000001-0000-4000-8000-000000000001', recipientUserId: hr, category: 'document_expiry' as const, titleAr: 'إقامة منتهية', titleEn: 'Iqama expired', bodyAr: 'انتهت إقامة سيد علي قبل 8 أيام.', bodyEn: 'Syed Ali\'s iqama expired 8 days ago.', readAt: null },
    { id: 'aa000001-0000-4000-8000-000000000002', recipientUserId: hr, category: 'document_expiry' as const, titleAr: 'إقامة تنتهي قريباً', titleEn: 'Iqama expiring soon', bodyAr: 'تنتهي إقامة جوزيف سانتوس خلال 5 أيام.', bodyEn: 'Joseph Santos\'s iqama expires in 5 days.', readAt: null },
    { id: 'aa000001-0000-4000-8000-000000000003', recipientUserId: hr, category: 'request' as const, titleAr: 'طلب جديد', titleEn: 'New request', bodyAr: 'طلب تصحيح رواتب من شركة الألف التجارية.', bodyEn: 'Payroll correction request from Alpha Trading Co.', readAt: null },
    { id: 'aa000001-0000-4000-8000-000000000004', recipientUserId: gro, category: 'task' as const, titleAr: 'مهمة متأخرة', titleEn: 'Overdue task', bodyAr: 'تسوية التأمينات الاجتماعية الربعية تجاوزت موعدها.', bodyEn: 'Quarterly GOSI reconciliation is past its due date.', readAt: null },
    // One already read, so the unread badge is a count rather than a total.
    { id: 'aa000001-0000-4000-8000-000000000005', recipientUserId: gro, category: 'general' as const, titleAr: 'تم تحديث معاملة', titleEn: 'Process updated', bodyAr: 'تم اعتماد تجديد رخصة العمل.', bodyEn: 'Work permit renewal was approved.', readAt: daysFromNow(-1) },
  ];
  for (const { id, ...rest } of rows) {
    await prisma.notification.upsert({ where: { id }, create: { id, ...rest }, update: rest });
  }
  return rows.length;
}

// UX-07: the dev database had accumulated 1709 notifications from test runs,
// all of them belonging to users the seed had since deleted and recreated. The
// bell showed "64 unread" of nothing anyone could act on. Orphans (rows whose
// user no longer exists) are unambiguously junk, so the seed clears them.
async function purgeOrphanNotifications(prisma: PrismaClient): Promise<number> {
  const users = await prisma.authUser.findMany({ select: { id: true } });
  const ids = users.map((u) => u.id);
  const { count } = await prisma.notification.deleteMany({
    where: { recipientUserId: { notIn: ids } },
  });
  return count;
}

// Leave (LEAVE-06, ADR-014): one company's worth of every leave state, placed
// relative to today like everything else here — someone away today, an
// overlapping pair (the clash note), the employee account's own pending request,
// one person overdrawn, carry-over credits and last year's leave — so the Leaves
// screen, the Balances tab, the Person Leave tab and My leave all show real
// figures. Filed spells write their ledger entries the way filing does (split
// by leave year), so the seed is right whatever day it runs.
async function seedLeave(prisma: PrismaClient): Promise<number> {
  const id = async (local: string) =>
    (await prisma.authUser.findUnique({ where: { email: seedEmail(local) } }))?.id ?? null;
  const [hr, repA, repB, employeeUser] = await Promise.all([
    id('staff-hr_officer'),
    id('client_manager-a'),
    id('client_manager-b'),
    id('employee-a'),
  ]);
  if (!hr || !repA || !repB || !employeeUser) return 0; // accounts not seeded → skip

  // Idempotency: replace exactly the leave of the seeded people.
  const seeded = EMPLOYEES.map(([, empId]) => empId);
  await prisma.leaveEntry.deleteMany({ where: { employeeId: { in: seeded } } });
  await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: seeded } } });

  const A = (n: number) => `e0000001-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const B1 = 'e0000002-0000-4000-8000-000000000001';
  const year = new Date().getUTCFullYear();
  type Spec = {
    emp: string;
    client: string;
    type: 'annual' | 'sick' | 'marriage';
    start: Date;
    days: number;
    status: 'pending' | 'approved' | 'declined' | 'withdrawn' | 'filed';
    raisedBy: string;
    selfRaised?: boolean;
    decidedBy?: string;
    details?: string;
    /** SOON-03: submitted this many days ago (0 = today)… */
    ago?: number;
    /** …and filed this many days after that (default: the next day). */
    filedAfter?: number;
  };
  // SOON-03: the dates are spread so a fresh seed shows EVERY service-level state
  // (2 working days from submission to filing): running, overdue while waiting on
  // the employer, overdue while approved and unfiled, met, late, and closed.
  const specs: Spec[] = [
    // Away today (5 of 7 days), filed; 30 days a year (hired 7 years ago).
    { emp: A(5), client: SEED_CLIENT_A, type: 'annual', start: daysFromNow(-2), days: 7, status: 'filed', raisedBy: repA, decidedBy: repA, details: 'Family visit. Cover agreed with the sales team.', ago: 9 },
    // The employee account's own request, waiting on the employer.
    { emp: A(2), client: SEED_CLIENT_A, type: 'annual', start: daysFromNow(21), days: 5, status: 'pending', raisedBy: employeeUser, selfRaised: true, details: 'Trip home after the quarter close.' },
    // Ahmed's leave earlier this year, filed.
    { emp: A(2), client: SEED_CLIENT_A, type: 'annual', start: daysFromNow(-60), days: 3, status: 'filed', raisedBy: hr, decidedBy: repA, ago: 70 },
    // Approved, awaiting filing — and overlapping the next one (the clash).
    { emp: A(3), client: SEED_CLIENT_A, type: 'annual', start: daysFromNow(9), days: 4, status: 'approved', raisedBy: repA, decidedBy: repA, details: 'Wedding of a sibling.', ago: 6 },
    { emp: A(9), client: SEED_CLIENT_A, type: 'annual', start: daysFromNow(10), days: 4, status: 'pending', raisedBy: hr, details: 'Short break; support rota covered by the vendor.', ago: 1 },
    // Sick leave waiting on the employer.
    { emp: A(6), client: SEED_CLIENT_A, type: 'sick', start: daysFromNow(3), days: 2, status: 'pending', raisedBy: hr, details: 'Planned minor procedure; certificate to follow.', ago: 5 },
    // Overdrawn: 25 days taken against ~18 accrued — the excess is unpaid.
    { emp: A(7), client: SEED_CLIENT_A, type: 'annual', start: daysFromNow(-90), days: 25, status: 'filed', raisedBy: repA, decidedBy: repA, details: 'Extended family leave, agreed as partly unpaid.', ago: 100, filedAfter: 5 },
    // Last-quarter leave for the long-serving supervisor.
    { emp: A(1), client: SEED_CLIENT_A, type: 'annual', start: daysFromNow(-120), days: 10, status: 'filed', raisedBy: hr, decidedBy: repA, ago: 130 },
    // Declined, and withdrawn.
    { emp: A(12), client: SEED_CLIENT_A, type: 'marriage', start: daysFromNow(30), days: 5, status: 'declined', raisedBy: hr, decidedBy: repA, ago: 3 },
    { emp: A(8), client: SEED_CLIENT_A, type: 'annual', start: daysFromNow(40), days: 6, status: 'withdrawn', raisedBy: repA, ago: 2 },
    // The other company: one pending request of its own.
    { emp: B1, client: SEED_CLIENT_B, type: 'annual', start: daysFromNow(14), days: 3, status: 'pending', raisedBy: repB, details: 'Eid travel.' },
  ];

  const now = new Date();
  const DAY = 86_400_000;
  let n = 0;
  for (const s of specs) {
    const decided = s.status !== 'pending' && s.status !== 'withdrawn';
    // Submitted `ago` days back; decided a few hours later; filed `filedAfter`
    // days after submission — never in the future.
    const submitted = new Date(now.getTime() - (s.ago ?? 0) * DAY);
    const later = (days: number) => new Date(Math.min(now.getTime(), submitted.getTime() + days * DAY));
    const row = await prisma.leaveRequest.create({
      data: {
        createdAt: submitted,
        clientId: s.client,
        employeeId: s.emp,
        type: s.type,
        startDate: s.start,
        days: s.days,
        endDate: leaveEndDate(s.start, s.days),
        details: s.details ?? null,
        status: s.status,
        raisedByUserId: s.raisedBy,
        raisedByEmployeeId: s.selfRaised ? s.emp : null,
        decidedByUserId: decided ? (s.decidedBy ?? repA) : null,
        decidedAt: decided ? later(0.25) : null,
        filedByUserId: s.status === 'filed' ? hr : null,
        filedAt: s.status === 'filed' ? later(s.filedAfter ?? 1) : null,
        withdrawnAt: s.status === 'withdrawn' ? later(0.25) : null,
      },
    });
    if (s.status === 'filed') {
      await prisma.leaveEntry.createMany({
        data: splitByYear(s.start, s.days).map((part) => ({
          clientId: s.client,
          employeeId: s.emp,
          requestId: row.id,
          kind: 'taken' as const,
          type: s.type,
          startDate: part.startDate,
          endDate: part.endDate,
          days: part.days,
          leaveYear: part.leaveYear,
          createdByUserId: hr,
        })),
      });
    }
    n += 1;
  }

  // Carried into this year (what the 1 January job would have credited), and a
  // spell from last year so the history spans years.
  await prisma.leaveEntry.createMany({
    data: [
      { clientId: SEED_CLIENT_A, employeeId: A(1), kind: 'carried' as const, type: 'annual' as const, days: 6, leaveYear: year },
      { clientId: SEED_CLIENT_A, employeeId: A(5), kind: 'carried' as const, type: 'annual' as const, days: 10, leaveYear: year },
    ],
  });
  const lastYear = await prisma.leaveRequest.create({
    data: {
      clientId: SEED_CLIENT_A,
      employeeId: A(1),
      type: 'annual',
      startDate: new Date(Date.UTC(year - 1, 5, 1)),
      days: 15,
      endDate: leaveEndDate(new Date(Date.UTC(year - 1, 5, 1)), 15),
      status: 'filed',
      raisedByUserId: hr,
      decidedByUserId: repA,
      createdAt: new Date(Date.UTC(year - 1, 4, 18, 9)),
      decidedAt: new Date(Date.UTC(year - 1, 4, 18, 13)),
      filedByUserId: hr,
      filedAt: new Date(Date.UTC(year - 1, 4, 19, 9)),
    },
  });
  await prisma.leaveEntry.create({
    data: {
      clientId: SEED_CLIENT_A,
      employeeId: A(1),
      requestId: lastYear.id,
      kind: 'taken',
      type: 'annual',
      startDate: lastYear.startDate,
      endDate: lastYear.endDate,
      days: 15,
      leaveYear: year - 1,
      createdByUserId: hr,
    },
  });
  return n + 1;
}

// Employee self-service (ADR-011) is per company and off by default. The seed
// switches it on for company A, so the seeded employee account can use My file /
// My leave on UAT (LEAVE-06). The e2e suites make their own companies.
async function seedSelfServiceFlag(prisma: PrismaClient): Promise<void> {
  await prisma.clientSetting.upsert({
    where: { clientId_key: { clientId: SEED_CLIENT_A, key: 'flag.employee-self-service' } },
    update: { value: true },
    create: { clientId: SEED_CLIENT_A, key: 'flag.employee-self-service', value: true },
  });
}

// DEP-01 (ADR-017): families on three expatriate employees' sponsorship, dated
// relative to seed time so the Family tab always has something to show: an
// expired dependant iqama, one inside the 90-day Renew window, one comfortable.
// Ahmed Hassan's family is there for the employee login's My file (DEP-04).
// Upserted back to LIVE (removed stamps cleared) on every run.
const SEED_DEPENDANTS: ReadonlyArray<{
  id: string;
  employeeId: string;
  relationship: 'spouse' | 'son' | 'daughter';
  en: string;
  ar: string;
  born: number; // years ago
  iqama: string | null;
  iqamaExpiry: number | null; // days from now
  passportExpiry: number | null;
  insuranceExpiry: number | null;
}> = [
  // Ahmed Hassan (EG, client A)
  { id: 'f2000001-0000-4000-8000-000000000001', employeeId: 'e0000001-0000-4000-8000-000000000002', relationship: 'spouse', en: 'Yasmin Hassan', ar: 'ياسمين حسن', born: 34, iqama: '2400000101', iqamaExpiry: 45, passportExpiry: 900, insuranceExpiry: 120 },
  { id: 'f2000001-0000-4000-8000-000000000002', employeeId: 'e0000001-0000-4000-8000-000000000002', relationship: 'son', en: 'Omar Hassan', ar: 'عمر حسن', born: 7, iqama: '2400000102', iqamaExpiry: 12, passportExpiry: 400, insuranceExpiry: 120 },
  // Syed Ali (PK, client A)
  { id: 'f2000001-0000-4000-8000-000000000003', employeeId: 'e0000001-0000-4000-8000-000000000004', relationship: 'spouse', en: 'Sadia Ali', ar: 'سعدية علي', born: 31, iqama: '2400000201', iqamaExpiry: 210, passportExpiry: 1200, insuranceExpiry: 75 },
  // Rajesh Kumar (IN, client B)
  { id: 'f2000001-0000-4000-8000-000000000004', employeeId: 'e0000002-0000-4000-8000-000000000001', relationship: 'spouse', en: 'Anitha Kumar', ar: 'أنيثا كومار', born: 38, iqama: '2400000301', iqamaExpiry: -6, passportExpiry: 640, insuranceExpiry: -6 },
  { id: 'f2000001-0000-4000-8000-000000000005', employeeId: 'e0000002-0000-4000-8000-000000000001', relationship: 'daughter', en: 'Maryam Kumar', ar: 'مريم كومار', born: 12, iqama: '2400000302', iqamaExpiry: -6, passportExpiry: 300, insuranceExpiry: -6 },
  { id: 'f2000001-0000-4000-8000-000000000006', employeeId: 'e0000002-0000-4000-8000-000000000001', relationship: 'son', en: 'Faris Kumar', ar: 'فارس كومار', born: 2, iqama: null, iqamaExpiry: null, passportExpiry: 1500, insuranceExpiry: null },
];

async function seedDependants(prisma: PrismaClient): Promise<number> {
  for (const d of SEED_DEPENDANTS) {
    const data = {
      employeeId: d.employeeId,
      relationship: d.relationship,
      nameEn: d.en,
      nameAr: d.ar,
      dateOfBirth: yearsAgo(d.born),
      iqamaNumber: d.iqama,
      iqamaExpiry: d.iqamaExpiry === null ? null : daysFromNow(d.iqamaExpiry),
      passportExpiry: d.passportExpiry === null ? null : daysFromNow(d.passportExpiry),
      insuranceExpiry: d.insuranceExpiry === null ? null : daysFromNow(d.insuranceExpiry),
      removedAt: null,
      removedByUserId: null,
    };
    await prisma.dependant.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
  }
  return SEED_DEPENDANTS.length;
}

// MOB-05 (ADR-018): sequences IN FLIGHT, so the "Mobilisations and exits" panels,
// the Hiring board's Visa & mobilisation column and the Mobilisation tab open on
// real files instead of an empty state:
//   · two onboardings mid-flight, each a NEW sample hire in status `onboarding`
//     (not under management — the seeded headcount is unchanged) with their
//     candidate in `mobilisation`, the pair the board creates (MOB-04b);
//   · one final exit, three steps in, for someone already on file.
// Every date is relative to seed day. Step rows are written for EVERY step of a
// run, as `SequencesService.start` does; a filed step carries its date and filer.
const SEED_MOBILISING: ReadonlyArray<{
  sequenceId: string;
  employeeId: string;
  candidateId: string;
  clientId: string;
  vacancyId: string;
  ar: string;
  en: string;
  nat: string;
  gender: 'male' | 'female';
  dept: string;
  jobAr: string;
  jobEn: string;
  salary: number;
  email: string;
  startedDaysAgo: number;
  /** Step key → days ago it was filed. */
  filed: Readonly<Record<string, number>>;
}> = [
  // Arrived and through the in-Kingdom medical: the iqama is next.
  { sequenceId: 'a5000001-0000-4000-8000-000000000001', employeeId: 'e0000003-0000-4000-8000-000000000009', candidateId: 'd1000003-0000-4000-8000-000000000002', clientId: SEED_CLIENT_C, vacancyId: 'c0000003-0000-4000-8000-000000000001', ar: 'بلال أحمد', en: 'Bilal Ahmed', nat: 'PK', gender: 'male', dept: 'Logistics', jobAr: 'سائق شاحنة', jobEn: 'Truck Driver', salary: 3900, email: 'bilal.a@example.com', startedDaysAgo: 34, filed: { 'block-visa': 34, 'visa-auth': 27, gamca: 21, enjaz: 14, travel: 8, 'medical-ksa': 4 } },
  // Still abroad: visa authorised, medical not yet cleared.
  { sequenceId: 'a5000001-0000-4000-8000-000000000002', employeeId: 'e0000004-0000-4000-8000-000000000008', candidateId: 'd1000004-0000-4000-8000-000000000003', clientId: SEED_CLIENT_D, vacancyId: 'c0000004-0000-4000-8000-000000000001', ar: 'ماريا سانتوس', en: 'Maria Santos', nat: 'PH', gender: 'female', dept: 'Clinical', jobAr: 'ممرضة', jobEn: 'Registered Nurse', salary: 9000, email: 'maria.s@example.com', startedDaysAgo: 9, filed: { 'block-visa': 9, 'visa-auth': 2 } },
];

// Kamal Uddin (client B) is leaving: notice, clearance and settlement are filed.
const SEED_FINAL_EXIT = {
  sequenceId: 'a5000001-0000-4000-8000-000000000003',
  employeeId: 'e0000002-0000-4000-8000-000000000006',
  clientId: SEED_CLIENT_B,
  startedDaysAgo: 12,
  filed: { notice: 12, clearance: 6, settlement: 2 } as Readonly<Record<string, number>>,
};

async function seedSequences(prisma: PrismaClient): Promise<number> {
  const gro = await prisma.authUser.findUnique({
    where: { email: seedEmail('staff-gro_officer') },
  });
  const by = gro?.id ?? null;

  // The new hires and their candidates. Not arrived or only just: no hire date
  // (onboarding's completion sets it — the arrival date), no iqama, no GOSI yet.
  for (const m of SEED_MOBILISING) {
    const employee = {
      clientId: m.clientId,
      nameAr: m.ar,
      nameEn: m.en,
      nationality: m.nat,
      gender: m.gender,
      department: m.dept,
      jobTitleAr: m.jobAr,
      jobTitleEn: m.jobEn,
      hireDate: null,
      contractType: 'unlimited' as const,
      employmentStatus: 'onboarding' as const,
      countsTowardSaudization: false,
      basicSalary: m.salary,
      housingAllowance: Math.round(m.salary * 0.25),
      gosiRegistrationStatus: 'not_registered' as const,
      wpsStatus: 'pending' as const,
    };
    await prisma.employee.upsert({
      where: { id: m.employeeId },
      create: { id: m.employeeId, ...employee },
      update: employee,
    });
    const candidate = {
      clientId: m.clientId,
      vacancyId: m.vacancyId,
      nameAr: m.ar,
      nameEn: m.en,
      nationality: m.nat,
      email: m.email,
      stage: 'mobilisation' as const,
      employeeId: m.employeeId,
    };
    await prisma.candidate.upsert({
      where: { id: m.candidateId },
      create: { id: m.candidateId, ...candidate },
      update: candidate,
    });
  }

  // MOB-06b: each run has ONE owner — whose work its ready steps are. The first
  // arrival is the GRO officer's, the second is left unassigned (so the queue
  // shows work nobody has taken), the final exit is an HR officer's.
  const hrOfficer = await prisma.authUser.findUnique({
    where: { email: seedEmail('staff-hr_officer') },
  });
  const runs = [
    ...SEED_MOBILISING.map((m, i) => ({
      ...m,
      kind: 'onboarding' as const,
      owner: i === 0 ? by : null,
    })),
    { ...SEED_FINAL_EXIT, kind: 'final_exit' as const, owner: hrOfficer?.id ?? null },
  ];
  // Idempotency: replace the seeded runs — and any other RUNNING run of the same
  // kind for the same person, which the one-running-per-kind index would refuse
  // to sit beside. Finished runs started by hand are history and are left alone.
  const stale = await prisma.groSequence.findMany({
    where: {
      OR: [
        { id: { in: runs.map((r) => r.sequenceId) } },
        ...runs.map((r) => ({ employeeId: r.employeeId, kind: r.kind, status: 'running' as const })),
      ],
    },
    select: { id: true },
  });
  const staleIds = stale.map((r) => r.id);
  await prisma.groSequenceStep.deleteMany({ where: { sequenceId: { in: staleIds } } });
  await prisma.groSequence.deleteMany({ where: { id: { in: staleIds } } });

  for (const r of runs) {
    await prisma.groSequence.create({
      data: {
        id: r.sequenceId,
        employeeId: r.employeeId,
        clientId: r.clientId,
        kind: r.kind,
        status: 'running',
        startedOn: daysFromNow(-r.startedDaysAgo),
        startedByUserId: by,
        assigneeUserId: r.owner,
        steps: {
          create: SEQUENCES[r.kind].steps.map((step) => {
            const ago = r.filed[step.key];
            return ago === undefined
              ? { stepKey: step.key }
              : { stepKey: step.key, filedOn: daysFromNow(-ago), filedByUserId: by };
          }),
        },
      },
    });
  }
  return runs.length;
}

// PROF-05 (ADR-019): a PROFILE for every sample company, so the Clients cards,
// the record's Nitaqat / Service panels and Records tab, and the Reports band
// open on something. Every value is invented sample data: the registration
// numbers are sequences, not real companies'.
//
// The bands are chosen to be useful, not typical: Beta is RED and Najd YELLOW —
// both have open roles with non-Saudi candidates, so the band warnings (PROF-06)
// have something to warn about — Alpha is medium green, Gulf Medical platinum.
// Al Waha, the archived company, has NO band and almost no profile on purpose:
// "not recorded" has to be reviewable too.
//
// Runs AFTER the users (the named officer is a staff account) and sets EVERY
// profile column on every run, nulls included — a seed that leaves a column
// alone cannot undo what a walk-through did to it (the THREAD-03 landmine).
interface ProfileSpec {
  id: string;
  cr: string | null;
  city: string | null;
  sector: string | null;
  band: 'red' | 'yellow' | 'low_green' | 'medium_green' | 'high_green' | 'platinum' | null;
  /** Days ago the band was checked. */
  checked: number;
  contact: { en: string; ar: string; role: string; email: string; phone: string } | null;
  signatories: Array<{ name: string; role: string }>;
  portals: string[];
  officer: 'staff-gro_officer' | 'staff-hr_officer' | null;
  tier: 'essential' | 'professional' | 'enterprise' | null;
  commitment: 'same_working_day' | 'one_working_day' | 'two_working_days' | null;
  /** Term: started N years ago, ends in N days (negative = already ended). */
  term: { startedYearsAgo: number; endsInDays: number } | null;
}

const CLIENT_PROFILES: readonly ProfileSpec[] = [
  { id: SEED_CLIENT_A, cr: '1010000001', city: 'riyadh', sector: 'wholesale_retail', band: 'medium_green', checked: 4, contact: { en: 'Hana Bin Turki', ar: 'هناء بنت تركي', role: 'HR Director', email: 'hana.t@alpha.example', phone: '+966 55 000 0101' }, signatories: [{ name: 'Hana Bin Turki', role: 'HR Director' }, { name: 'Abdulaziz Al Faisal', role: 'General Manager' }], portals: ['qiwa', 'muqeem', 'gosi', 'absher', 'mudad'], officer: 'staff-gro_officer', tier: 'professional', commitment: 'same_working_day', term: { startedYearsAgo: 2, endsInDays: 141 } },
  { id: SEED_CLIENT_B, cr: '2050000002', city: 'dammam', sector: 'construction', band: 'red', checked: 12, contact: { en: 'Saleh Al-Dossari', ar: 'صالح الدوسري', role: 'Head of Administration', email: 's.dossari@beta.example', phone: '+966 50 000 0202' }, signatories: [{ name: 'Saleh Al-Dossari', role: 'Head of Administration' }, { name: 'Mansour Al-Najdi', role: 'Managing Director' }, { name: 'Fahad Bin Saleh', role: 'Finance Director' }], portals: ['qiwa', 'muqeem', 'gosi', 'absher', 'mudad', 'balady'], officer: 'staff-gro_officer', tier: 'enterprise', commitment: 'same_working_day', term: { startedYearsAgo: 3, endsInDays: 48 } },
  { id: SEED_CLIENT_C, cr: '4030000003', city: 'jeddah', sector: 'transport_storage', band: 'yellow', checked: 1, contact: { en: 'Nawaf Al-Zahrani', ar: 'نواف الزهراني', role: 'Operations Manager', email: 'nawaf@najd.example', phone: '+966 56 000 0303' }, signatories: [{ name: 'Nawaf Al-Zahrani', role: 'Operations Manager' }, { name: 'Rania Al-Harthi', role: 'Finance Manager' }], portals: ['qiwa', 'muqeem', 'gosi', 'absher'], officer: 'staff-hr_officer', tier: 'professional', commitment: 'one_working_day', term: { startedYearsAgo: 1, endsInDays: 310 } },
  { id: SEED_CLIENT_D, cr: '2051000004', city: 'jubail', sector: 'healthcare', band: 'platinum', checked: 30, contact: { en: 'Ibrahim Al-Qahtani', ar: 'إبراهيم القحطاني', role: 'Administration Director', email: 'i.qahtani@gulfmedical.example', phone: '+966 53 000 0404' }, signatories: [{ name: 'Ibrahim Al-Qahtani', role: 'Administration Director' }], portals: ['qiwa', 'gosi', 'mudad'], officer: 'staff-gro_officer', tier: 'essential', commitment: 'two_working_days', term: { startedYearsAgo: 1, endsInDays: 22 } },
  // Archived, and deliberately thin: a registration and nothing else.
  { id: SEED_CLIENT_E, cr: '1010000005', city: 'riyadh', sector: 'wholesale_retail', band: null, checked: 0, contact: null, signatories: [], portals: [], officer: null, tier: null, commitment: null, term: null },
];

async function seedClientProfiles(prisma: PrismaClient): Promise<number> {
  const officerId = async (local: ProfileSpec['officer']) =>
    local
      ? ((await prisma.authUser.findUnique({ where: { email: seedEmail(local) } }))?.id ?? null)
      : null;
  for (const p of CLIENT_PROFILES) {
    await prisma.client.update({
      where: { id: p.id },
      data: {
        crNumber: p.cr,
        city: p.city,
        sector: p.sector,
        nitaqatBand: p.band,
        nitaqatCheckedOn: p.band ? daysFromNow(-p.checked) : null,
        qiwaEstablishment: p.contact && p.cr ? `1-${p.cr}` : null,
        gosiEstablishment: p.contact && p.cr ? `${p.cr.slice(0, 3)}-${p.cr.slice(3, 6)}-${p.cr.slice(6)}` : null,
        // Fifteen digits; a sequence, not a real VAT number.
        vatNumber: p.contact && p.cr ? `3${p.cr}0003` : null,
        contactNameEn: p.contact?.en ?? null,
        contactNameAr: p.contact?.ar ?? null,
        contactRole: p.contact?.role ?? null,
        contactEmail: p.contact?.email ?? null,
        contactPhone: p.contact?.phone ?? null,
        signatories: p.signatories,
        portals: p.portals,
        officerUserId: await officerId(p.officer),
        serviceTier: p.tier,
        responseCommitment: p.commitment,
        termStart: p.term ? yearsAgo(p.term.startedYearsAgo) : null,
        termEnd: p.term ? daysFromNow(p.term.endsInDays) : null,
      },
    });
  }
  return CLIENT_PROFILES.length;
}

// BILL-06 (ADR-020): BILLING sample data, so the Commercial and Fees tabs, the
// Reports fee figures and the overdue banner open on something:
//   · commercial terms for the four active companies (Al Waha, archived, has
//     none — "no terms recorded" has to be reviewable too);
//   · government fees in every state: recorded, on an invoice, void; tied to
//     a seeded onboarding step, to a completed procedure, and recorded by hand
//     (for a person, and company-level); one OLD and still owed, because "not
//     yet recovered" counts a fee whatever its age;
//   · invoice records in every standing: Alpha paid up, Beta OVERDUE with a
//     second invoice still within terms, Najd awaiting payment, Gulf Medical
//     with none recorded.
// Every figure is invented. Invoice amounts are simply the cycle's subscription
// plus the fees recovered — no tax — so a reviewer can add them up; a real
// record carries whatever the issued invoice says. No receipts are seeded.
// Dates are relative to seed day. Fee references are fixed (`GF-S01…`, S for
// sample) so re-seeding does not consume the real `GF-0001…` sequence.
const SEED_TERMS: ReadonlyArray<{
  clientId: string;
  platform: number;
  seat: number;
  cycle: 'monthly' | 'quarterly' | 'annual';
  po: string | null;
  days: number;
}> = [
  { clientId: SEED_CLIENT_A, platform: 350_000, seat: 6_500, cycle: 'quarterly', po: 'PO-ALPHA-2026-014', days: 30 },
  { clientId: SEED_CLIENT_B, platform: 600_000, seat: 5_500, cycle: 'monthly', po: 'PO-BETA-7781', days: 45 },
  { clientId: SEED_CLIENT_C, platform: 350_000, seat: 6_500, cycle: 'quarterly', po: null, days: 30 },
  { clientId: SEED_CLIENT_D, platform: 150_000, seat: 4_500, cycle: 'annual', po: 'GMG-PO-2291', days: 60 },
];

const INV_ALPHA_PAID = 'b1000001-0000-4000-8000-000000000001';
const INV_BETA_OVERDUE = 'b1000002-0000-4000-8000-000000000001';
const INV_BETA_SENT = 'b1000002-0000-4000-8000-000000000002';
const INV_NAJD_SENT = 'b1000003-0000-4000-8000-000000000001';
const SEED_INVOICES: ReadonlyArray<{
  id: string;
  clientId: string;
  number: string;
  issuedDaysAgo: number;
  /** Negative = already past its due date. */
  dueInDays: number;
  amount: number;
  paidDaysAgo: number | null;
}> = [
  // A quarter's subscription (SAR 12,645) + the iqama fee it recovers. Paid.
  { id: INV_ALPHA_PAID, clientId: SEED_CLIENT_A, number: 'INV-2026-0412', issuedDaysAgo: 75, dueInDays: -45, amount: 1_329_500, paidDaysAgo: 50 },
  // A month's subscription, fifteen days past its 45-day terms: OVERDUE.
  { id: INV_BETA_OVERDUE, clientId: SEED_CLIENT_B, number: 'INV-2026-0455', issuedDaysAgo: 60, dueInDays: -15, amount: 649_500, paidDaysAgo: null },
  // The next month + the exit re-entry fee. Still within terms.
  { id: INV_BETA_SENT, clientId: SEED_CLIENT_B, number: 'INV-2026-0478', issuedDaysAgo: 29, dueInDays: 16, amount: 669_500, paidDaysAgo: null },
  // A quarter (SAR 12,060) + the block visa for the new driver.
  { id: INV_NAJD_SENT, clientId: SEED_CLIENT_C, number: 'INV-2026-0481', issuedDaysAgo: 20, dueInDays: 10, amount: 1_406_000, paidDaysAgo: null },
];

type SeedFeeSource =
  | { kind: 'manual'; label: string; employeeId?: string }
  | { kind: 'step'; sequenceId: string; stepKey: string; employeeId: string }
  | { kind: 'procedure'; processId: string; type: string; employeeId: string };
const SEED_FEES: ReadonlyArray<{
  n: number;
  clientId: string;
  source: SeedFeeSource;
  authority: string;
  amount: number;
  paidDaysAgo: number;
  invoiceId?: string;
  voidReason?: string;
}> = [
  // Alpha
  { n: 1, clientId: SEED_CLIENT_A, source: { kind: 'manual', label: 'Iqama renewal fee', employeeId: 'e0000001-0000-4000-8000-000000000004' }, authority: 'muqeem', amount: 65_000, paidDaysAgo: 80, invoiceId: INV_ALPHA_PAID },
  { n: 2, clientId: SEED_CLIENT_A, source: { kind: 'manual', label: 'Chamber of Commerce attestation' }, authority: 'chamber', amount: 15_000, paidDaysAgo: 12 },
  // Old, and still owed: outside every 90-day figure, inside "not yet recovered".
  { n: 3, clientId: SEED_CLIENT_A, source: { kind: 'manual', label: 'Work permit levy', employeeId: 'e0000001-0000-4000-8000-000000000006' }, authority: 'qiwa', amount: 970_000, paidDaysAgo: 130 },
  { n: 4, clientId: SEED_CLIENT_A, source: { kind: 'manual', label: 'Medical insurance top-up' }, authority: 'cchi', amount: 30_000, paidDaysAgo: 6, voidReason: 'Recorded twice' },
  // Beta
  { n: 5, clientId: SEED_CLIENT_B, source: { kind: 'procedure', processId: 'e1000002-0000-4000-8000-000000000003', type: 'exit_reentry', employeeId: 'e0000002-0000-4000-8000-000000000004' }, authority: 'muqeem', amount: 20_000, paidDaysAgo: 20, invoiceId: INV_BETA_SENT },
  { n: 6, clientId: SEED_CLIENT_B, source: { kind: 'manual', label: 'Municipality licence renewal' }, authority: 'balady', amount: 120_000, paidDaysAgo: 35 },
  // Najd — Bilal Ahmed's onboarding (the steps the sequence seed files).
  { n: 7, clientId: SEED_CLIENT_C, source: { kind: 'step', sequenceId: 'a5000001-0000-4000-8000-000000000001', stepKey: 'block-visa', employeeId: 'e0000003-0000-4000-8000-000000000009' }, authority: 'qiwa', amount: 200_000, paidDaysAgo: 34, invoiceId: INV_NAJD_SENT },
  { n: 8, clientId: SEED_CLIENT_C, source: { kind: 'step', sequenceId: 'a5000001-0000-4000-8000-000000000001', stepKey: 'enjaz', employeeId: 'e0000003-0000-4000-8000-000000000009' }, authority: 'enjaz', amount: 20_000, paidDaysAgo: 14 },
  { n: 9, clientId: SEED_CLIENT_C, source: { kind: 'step', sequenceId: 'a5000001-0000-4000-8000-000000000001', stepKey: 'medical-ksa', employeeId: 'e0000003-0000-4000-8000-000000000009' }, authority: 'seha', amount: 30_000, paidDaysAgo: 4 },
  // Gulf Medical — Maria Santos' onboarding.
  { n: 10, clientId: SEED_CLIENT_D, source: { kind: 'step', sequenceId: 'a5000001-0000-4000-8000-000000000002', stepKey: 'block-visa', employeeId: 'e0000004-0000-4000-8000-000000000008' }, authority: 'qiwa', amount: 200_000, paidDaysAgo: 9 },
];
const seedFeeId = (n: number) => `b2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const seedFeeRef = (n: number) => `GF-S${String(n).padStart(2, '0')}`;

async function seedBilling(prisma: PrismaClient): Promise<{ fees: number; invoices: number }> {
  const [gro, hr, admin] = await Promise.all(
    ['staff-gro_officer', 'staff-hr_officer', 'staff-administrator'].map((key) =>
      prisma.authUser.findUnique({ where: { email: seedEmail(key) } }),
    ),
  );

  // Terms: one row per client — written whole, so a walk-through's edit is undone.
  for (const t of SEED_TERMS) {
    const terms = {
      platformFeeHalalas: t.platform,
      seatRateHalalas: t.seat,
      cycle: t.cycle,
      poNumber: t.po,
      paymentTermsDays: t.days,
      updatedByUserId: admin?.id ?? null,
    };
    await prisma.billingTerms.upsert({
      where: { clientId: t.clientId },
      create: { clientId: t.clientId, ...terms },
      update: terms,
    });
  }

  // Idempotency: replace the seeded fees and invoices — and whatever would
  // collide with them: a record with a seeded number, a live fee already
  // recorded for a seeded step or procedure. A fee someone else linked to a
  // seeded invoice goes back to waiting first (the foreign key would otherwise
  // refuse the delete). Everything else in the ledger is left alone.
  const staleInvoices = (
    await prisma.invoice.findMany({
      where: {
        OR: [
          { id: { in: SEED_INVOICES.map((i) => i.id) } },
          ...SEED_INVOICES.map((i) => ({
            clientId: i.clientId,
            number: { equals: i.number, mode: 'insensitive' as const },
          })),
        ],
      },
      select: { id: true },
    })
  ).map((i) => i.id);
  await prisma.fee.deleteMany({
    where: {
      OR: [
        { id: { in: SEED_FEES.map((f) => seedFeeId(f.n)) } },
        { ref: { in: SEED_FEES.map((f) => seedFeeRef(f.n)) } },
        ...SEED_FEES.flatMap((f) =>
          f.source.kind === 'step'
            ? [{ sequenceId: f.source.sequenceId, stepKey: f.source.stepKey, status: { not: 'void' as const } }]
            : f.source.kind === 'procedure'
              ? [{ processId: f.source.processId, status: { not: 'void' as const } }]
              : [],
        ),
      ],
    },
  });
  await prisma.fee.updateMany({
    where: { invoiceId: { in: staleInvoices } },
    data: { status: 'recorded', invoiceId: null },
  });
  await prisma.invoice.deleteMany({ where: { id: { in: staleInvoices } } });

  for (const i of SEED_INVOICES) {
    await prisma.invoice.create({
      data: {
        id: i.id,
        clientId: i.clientId,
        number: i.number,
        issuedOn: daysFromNow(-i.issuedDaysAgo),
        dueOn: daysFromNow(i.dueInDays),
        amountHalalas: i.amount,
        status: i.paidDaysAgo === null ? 'sent' : 'paid',
        paidOn: i.paidDaysAgo === null ? null : daysFromNow(-i.paidDaysAgo),
        recordedByUserId: admin?.id ?? null,
      },
    });
  }
  for (const f of SEED_FEES) {
    const src = f.source;
    await prisma.fee.create({
      data: {
        id: seedFeeId(f.n),
        ref: seedFeeRef(f.n),
        clientId: f.clientId,
        employeeId: src.employeeId ?? null,
        ...(src.kind === 'manual'
          ? { sourceKind: 'manual' as const, label: src.label }
          : src.kind === 'step'
            ? {
                sourceKind: 'sequence_step' as const,
                sequenceId: src.sequenceId,
                sequenceKind: 'onboarding',
                stepKey: src.stepKey,
              }
            : { sourceKind: 'procedure' as const, processId: src.processId, procedureType: src.type }),
        authority: f.authority,
        amountHalalas: f.amount,
        paidOn: daysFromNow(-f.paidDaysAgo),
        recordedByUserId: gro?.id ?? null,
        ...(f.voidReason
          ? {
              status: 'void' as const,
              voidedAt: daysFromNowAt(-f.paidDaysAgo + 1, 9),
              voidedByUserId: hr?.id ?? null,
              voidReason: f.voidReason,
            }
          : f.invoiceId
            ? { status: 'invoiced' as const, invoiceId: f.invoiceId }
            : {}),
      },
    });
  }
  return { fees: SEED_FEES.length, invoices: SEED_INVOICES.length };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL ?? ''),
  });
  // SEED-01: the files behind the documents (local MinIO in development; on UAT
  // every storage setting must be supplied, or this throws before anything runs).
  const files = new SeedFiles(seedStorageFor(process.env));

  try {
    // Client companies first — they originate the client_ids everything else
    // references (no FK across modules, so order is for clarity, not integrity).
    const clientCount = await seedClients(prisma);
    const employeeCount = await seedEmployees(prisma);
    const dependantCount = await seedDependants(prisma);
    const documentCount = await seedDocuments(prisma, files);

    const fixtures = [
      { clientId: SEED_CLIENT_A, note: 'seed:client-a:sample-1' },
      { clientId: SEED_CLIENT_A, note: 'seed:client-a:sample-2' },
      { clientId: SEED_CLIENT_B, note: 'seed:client-b:sample-1' },
    ];

    // Idempotency: replace exactly the seed-owned rows (note prefix "seed:"),
    // never touching data created by tests or manual use.
    await prisma.coreScopeCheck.deleteMany({ where: { note: { startsWith: 'seed:' } } });
    await prisma.coreScopeCheck.createMany({ data: fixtures });

    const userCount = await seedUsers(prisma);
    const profileCount = await seedClientProfiles(prisma);
    const requestCount = await seedRequests(prisma);
    const attachmentCount = await seedRequestAttachments(prisma, files);
    const taskCount = await seedTasks(prisma);
    const vacancyCount = await seedVacancies(prisma);
    const candidateCount = await seedCandidates(prisma);
    const groCount = await seedGroProcesses(prisma);
    const sequenceCount = await seedSequences(prisma);
    const billing = await seedBilling(prisma);
    const calendarCount = await seedCalendarEvents(prisma);
    const leaveCount = await seedLeave(prisma);
    await seedSelfServiceFlag(prisma);
    const purgedNotifications = await purgeOrphanNotifications(prisma);
    const notificationCount = await seedNotifications(prisma);

    const rowCount = await prisma.coreScopeCheck.count({
      where: { note: { startsWith: 'seed:' } },
    });
    const rolesCovered = new Set(STAFF_ACCOUNTS.map((a) => a.role)).size + 1 + 1; // + client_manager + employee
    process.stdout.write(
      `Seed complete: ${clientCount} client companies (${profileCount} profiles); ${employeeCount} employees; ${dependantCount} dependants; ${documentCount} documents (with files); ${requestCount} requests; ${attachmentCount} request files; ${taskCount} tasks; ${vacancyCount} vacancies; ${candidateCount} candidates; ${groCount} GRO processes; ${sequenceCount} sequences in flight (+${SEED_MOBILISING.length} hires onboarding, each with a candidate in mobilisation); commercial terms for ${SEED_TERMS.length} clients, ${billing.fees} government fees, ${billing.invoices} invoice records; ${calendarCount} calendar events; ${leaveCount} leave requests; ${rowCount} scope-check rows ` +
        `${notificationCount} notifications (purged ${purgedNotifications} orphans); ` +
        `across clients A (${SEED_CLIENT_A}) and B (${SEED_CLIENT_B}); ${userCount} auth users ` +
        `(${STAFF_ACCOUNTS.length} staff + ${CLIENT_REP_ASSIGNMENTS.length} client managers + 1 employee, ` +
        `${rolesCovered}/${STAFF_ROLES.length + CLIENT_ROLES.length + 1} roles covered).\n`,
    );
  } finally {
    files.close();
    await prisma.$disconnect();
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
