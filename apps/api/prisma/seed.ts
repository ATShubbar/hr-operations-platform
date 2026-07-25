import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../src/generated/prisma/client';
import {
  CLIENT_ROLES,
  PasswordService,
  STAFF_ROLES,
  type ClientRole,
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
export const SEED_USER_DOMAIN = 'seed.hr.local';

// One shared dev password across seed users. The seed is production-guarded
// (below), so these credentials never exist outside development.
const SEED_PASSWORD = 'Seed-dev-password-1';

// One client-rep per seeded client, chosen to cover BOTH client roles across
// the two clients (client A → admin, client B → user).
const CLIENT_REP_ASSIGNMENTS: ReadonlyArray<{ clientId: string; role: ClientRole }> = [
  { clientId: SEED_CLIENT_A, role: 'client_admin' },
  { clientId: SEED_CLIENT_B, role: 'client_user' },
];

const clientLetter = (clientId: string): string =>
  clientId === SEED_CLIENT_A ? 'a' : 'b';

async function seedUsers(prisma: PrismaClient): Promise<number> {
  const passwords = new PasswordService();

  // One staff user per role (all seven staff roles) + one client-rep per
  // seeded client. Admin roles (system_admin/company_admin) are seeded WITHOUT
  // an mfa_secret — they log in to an enroll-required session until they
  // enroll, exactly as AUTH-06 requires; the seed never fakes enrollment.
  const staffUsers: Prisma.AuthUserCreateManyInput[] = await Promise.all(
    STAFF_ROLES.map(async (role) => ({
      email: `staff-${role}@${SEED_USER_DOMAIN}`,
      passwordHash: await passwords.hash(SEED_PASSWORD),
      principalType: 'staff' as const,
      role,
    })),
  );

  const clientRepUsers: Prisma.AuthUserCreateManyInput[] = await Promise.all(
    CLIENT_REP_ASSIGNMENTS.map(async ({ clientId, role }) => ({
      email: `${role}-${clientLetter(clientId)}@${SEED_USER_DOMAIN}`,
      passwordHash: await passwords.hash(SEED_PASSWORD),
      principalType: 'client_rep' as const,
      role,
      clientId,
    })),
  );

  const data = [...staffUsers, ...clientRepUsers];

  // Idempotency: replace exactly the seed-owned users (by email domain),
  // leaving any test- or manually-created users untouched.
  await prisma.authUser.deleteMany({
    where: { email: { endsWith: `@${SEED_USER_DOMAIN}` } },
  });
  await prisma.authUser.createMany({ data });

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

async function seedEmployees(prisma: PrismaClient): Promise<number> {
  let n = 0;
  for (const [clientId, id, e] of EMPLOYEES) {
    const saudi = e.nat === 'SA';
    // Identifier shapes follow the real ones: a national id starts with 1, an
    // iqama with 2. Derived from the row id so they stay stable across runs.
    const serial = id.slice(-6);
    const rest = {
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

async function seedDocuments(prisma: PrismaClient): Promise<number> {
  for (const d of DOCUMENTS) {
    const fileName = `${d.category}-${d.id.slice(-4)}.pdf`;
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
    };
    const storageKey = `clients/${d.client}/documents/${d.id}/${fileName}`;
    await prisma.document.upsert({
      where: { id: d.id },
      create: { id: d.id, storageKey, ...rest },
      update: { storageKey, ...rest },
    });
  }
  return DOCUMENTS.length;
}

async function seedRequests(prisma: PrismaClient): Promise<number> {
  // Client-facing workflow requests (REQ-01), attributed to the seeded client
  // reps. Due dates are relative, and SOME ARE IN THE PAST — an ops console with
  // nothing overdue cannot show what it is for.
  const repA = await prisma.authUser.findUnique({
    where: { email: `client_admin-a@${SEED_USER_DOMAIN}` },
  });
  const repB = await prisma.authUser.findUnique({
    where: { email: `client_user-b@${SEED_USER_DOMAIN}` },
  });
  if (!repA || !repB) return 0; // reps not seeded → skip

  const requests = [
    { id: 'a0000001-0000-4000-8000-000000000001', clientId: SEED_CLIENT_A, type: 'letter' as const, title: 'Salary certificate for Ahmed Hassan', description: 'Please issue a salary certificate addressed to the bank.', priority: 'normal' as const, status: 'open' as const, dueDate: daysFromNow(-4), createdByUserId: repA.id },
    { id: 'a0000001-0000-4000-8000-000000000002', clientId: SEED_CLIENT_A, type: 'gro_service' as const, title: 'Iqama renewal — Ahmed Hassan', priority: 'high' as const, status: 'in_progress' as const, dueDate: daysFromNow(3), createdByUserId: repA.id },
    { id: 'a0000001-0000-4000-8000-000000000003', clientId: SEED_CLIENT_A, type: 'document' as const, title: 'Onboarding pack — Noura Alsubaie', priority: 'normal' as const, status: 'resolved' as const, dueDate: daysFromNow(-20), createdByUserId: repA.id },
    { id: 'a0000001-0000-4000-8000-000000000004', clientId: SEED_CLIENT_A, type: 'general' as const, title: 'Payroll correction — August overtime', description: 'Overtime hours for the warehouse team were understated.', priority: 'high' as const, status: 'open' as const, dueDate: daysFromNow(1), createdByUserId: repA.id },
    { id: 'a0000001-0000-4000-8000-000000000005', clientId: SEED_CLIENT_A, type: 'general' as const, title: 'Update commercial registration copy', priority: 'low' as const, status: 'closed' as const, dueDate: daysFromNow(-45), createdByUserId: repA.id },
    { id: 'a0000002-0000-4000-8000-000000000001', clientId: SEED_CLIENT_B, type: 'certificate' as const, title: 'Employment letter — Rajesh Kumar', priority: 'normal' as const, status: 'open' as const, dueDate: daysFromNow(6), createdByUserId: repB.id },
    { id: 'a0000002-0000-4000-8000-000000000002', clientId: SEED_CLIENT_B, type: 'gro_service' as const, title: 'Exit-reentry visa — Anil Thomas', priority: 'high' as const, status: 'in_progress' as const, dueDate: daysFromNow(-1), createdByUserId: repB.id },
    { id: 'a0000002-0000-4000-8000-000000000003', clientId: SEED_CLIENT_B, type: 'general' as const, title: 'Final settlement — site labourer', priority: 'normal' as const, status: 'cancelled' as const, dueDate: daysFromNow(-30), createdByUserId: repB.id },
    { id: 'a0000002-0000-4000-8000-000000000004', clientId: SEED_CLIENT_B, type: 'letter' as const, title: 'Bank account opening letter — Kamal Uddin', priority: 'low' as const, status: 'open' as const, dueDate: daysFromNow(14), createdByUserId: repB.id },
  ];
  for (const { id, ...rest } of requests) {
    await prisma.request.upsert({ where: { id }, create: { id, ...rest }, update: rest });
  }
  return requests.length;
}

async function seedTasks(prisma: PrismaClient): Promise<number> {
  // Internal work items (TASK-01). Spread across SEVERAL staff plus one
  // unassigned: every seeded task used to belong to the GRO officer, so the
  // "assign to me" action and the own/assigned scope were invisible to everyone
  // else who signed in.
  const byEmail = async (email: string) =>
    (await prisma.authUser.findUnique({ where: { email: `${email}@${SEED_USER_DOMAIN}` } }))?.id ?? null;
  const gro = await byEmail('staff-gro_officer');
  const hr = await byEmail('staff-hr_officer');
  const recruiter = await byEmail('staff-recruiter');
  const finance = await byEmail('staff-finance');

  const tasks = [
    { id: 'b0000001-0000-4000-8000-000000000001', clientId: SEED_CLIENT_A, requestId: 'a0000001-0000-4000-8000-000000000002', title: 'Prepare iqama renewal paperwork — Ahmed Hassan', status: 'in_progress' as const, priority: 'high' as const, dueDate: daysFromNow(2), assigneeUserId: gro },
    { id: 'b0000001-0000-4000-8000-000000000002', clientId: SEED_CLIENT_A, title: 'Quarterly GOSI reconciliation', status: 'open' as const, priority: 'normal' as const, dueDate: daysFromNow(-2), assigneeUserId: gro },
    { id: 'b0000001-0000-4000-8000-000000000003', clientId: SEED_CLIENT_A, title: 'Collect signed contract — Noura Alsubaie', status: 'done' as const, priority: 'normal' as const, dueDate: daysFromNow(-9), assigneeUserId: hr },
    { id: 'b0000001-0000-4000-8000-000000000004', clientId: SEED_CLIENT_A, title: 'Chase expired iqama — Syed Ali', status: 'open' as const, priority: 'high' as const, dueDate: daysFromNow(-5), assigneeUserId: hr },
    { id: 'b0000001-0000-4000-8000-000000000005', clientId: SEED_CLIENT_A, title: 'Schedule interviews — Senior Accountant', status: 'in_progress' as const, priority: 'normal' as const, dueDate: daysFromNow(4), assigneeUserId: recruiter },
    { id: 'b0000002-0000-4000-8000-000000000001', clientId: SEED_CLIENT_B, title: 'WPS file upload — August', status: 'open' as const, priority: 'high' as const, dueDate: daysFromNow(1), assigneeUserId: finance },
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
  const recruiter = await prisma.authUser.findUnique({
    where: { email: `staff-recruiter@${SEED_USER_DOMAIN}` },
  });
  const by = recruiter?.id ?? null;
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
    await prisma.candidate.upsert({ where: { id }, create: { id, ...rest }, update: rest });
  }
  return candidates.length;
}

async function seedGroProcesses(prisma: PrismaClient): Promise<number> {
  // Government processes (GRO-01) across the workflow, INCLUDING overdue ones —
  // a deadline screen with everything comfortably in the future teaches nothing.
  const gro = await prisma.authUser.findUnique({
    where: { email: `staff-gro_officer@${SEED_USER_DOMAIN}` },
  });
  const by = gro?.id ?? null;
  const processes = [
    { id: 'e1000001-0000-4000-8000-000000000001', clientId: SEED_CLIENT_A, employeeId: 'e0000001-0000-4000-8000-000000000002', type: 'iqama_renewal' as const, status: 'in_progress' as const, referenceNumber: 'MUQ-2026-00123', dueDate: daysFromNow(9), assigneeUserId: by },
    { id: 'e1000001-0000-4000-8000-000000000002', clientId: SEED_CLIENT_A, employeeId: 'e0000001-0000-4000-8000-000000000002', type: 'exit_reentry' as const, status: 'not_started' as const, dueDate: daysFromNow(25), assigneeUserId: by },
    { id: 'e1000001-0000-4000-8000-000000000003', clientId: SEED_CLIENT_A, employeeId: 'e0000001-0000-4000-8000-000000000004', type: 'iqama_renewal' as const, status: 'submitted' as const, referenceNumber: 'MUQ-2026-00871', dueDate: daysFromNow(-6), assigneeUserId: by },
    { id: 'e1000001-0000-4000-8000-000000000004', clientId: SEED_CLIENT_A, employeeId: 'e0000001-0000-4000-8000-000000000006', type: 'work_permit_renewal' as const, status: 'approved' as const, referenceNumber: 'QIWA-2026-1180', dueDate: daysFromNow(4), assigneeUserId: by },
    { id: 'e1000002-0000-4000-8000-000000000001', clientId: SEED_CLIENT_B, employeeId: 'e0000002-0000-4000-8000-000000000001', type: 'sponsorship_transfer' as const, status: 'submitted' as const, referenceNumber: 'QIWA-2026-4567', dueDate: daysFromNow(-1), assigneeUserId: by },
    { id: 'e1000002-0000-4000-8000-000000000002', clientId: SEED_CLIENT_B, employeeId: 'e0000002-0000-4000-8000-000000000003', type: 'iqama_renewal' as const, status: 'rejected' as const, referenceNumber: 'MUQ-2026-00994', dueDate: daysFromNow(-11), assigneeUserId: by },
    { id: 'e1000002-0000-4000-8000-000000000003', clientId: SEED_CLIENT_B, employeeId: 'e0000002-0000-4000-8000-000000000004', type: 'exit_reentry' as const, status: 'completed' as const, referenceNumber: 'MUQ-2026-00512', dueDate: daysFromNow(-18), resultingExpiry: daysFromNow(160), assigneeUserId: by },
    { id: 'e1000003-0000-4000-8000-000000000001', clientId: SEED_CLIENT_C, employeeId: 'e0000003-0000-4000-8000-000000000002', type: 'iqama_renewal' as const, status: 'in_progress' as const, referenceNumber: 'MUQ-2026-01204', dueDate: daysFromNow(1), assigneeUserId: by },
    { id: 'e1000004-0000-4000-8000-000000000001', clientId: SEED_CLIENT_D, employeeId: 'e0000004-0000-4000-8000-000000000002', type: 'profession_change' as const, status: 'not_started' as const, dueDate: daysFromNow(13), assigneeUserId: by },
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
    (await prisma.authUser.findUnique({ where: { email: `${email}@${SEED_USER_DOMAIN}` } }))?.id ?? null;
  const recruiter = await byEmail('staff-recruiter');
  const gro = await byEmail('staff-gro_officer');
  const hr = await byEmail('staff-hr_officer');
  if (!recruiter || !gro || !hr) return 0;
  const events = [
    { id: 'f0000001-0000-4000-8000-000000000001', ownerUserId: recruiter, clientId: SEED_CLIENT_A, title: 'Interview — Salem Alqahtani — Senior Accountant', location: 'Riyadh office — Room 2', startAt: daysFromNowAt(1, 9), endAt: daysFromNowAt(1, 10), allDay: false },
    { id: 'f0000001-0000-4000-8000-000000000002', ownerUserId: gro, clientId: SEED_CLIENT_A, title: 'Muqeem visit — iqama renewals batch', location: 'Muqeem service center', startAt: daysFromNowAt(0, 7, 30), endAt: daysFromNowAt(0, 9, 30), allDay: false },
    { id: 'f0000001-0000-4000-8000-000000000003', ownerUserId: gro, clientId: SEED_CLIENT_B, title: 'Qiwa appointment — sponsorship transfer', location: 'Qiwa service center', startAt: daysFromNowAt(2, 8), endAt: daysFromNowAt(2, 9), allDay: false },
    { id: 'f0000001-0000-4000-8000-000000000004', ownerUserId: hr, clientId: SEED_CLIENT_D, title: 'Client review — Gulf Medical Group', location: 'Client premises', startAt: daysFromNowAt(3, 11), endAt: daysFromNowAt(3, 12, 30), allDay: false },
    { id: 'f0000001-0000-4000-8000-000000000005', ownerUserId: recruiter, clientId: SEED_CLIENT_C, title: 'Interview — Imran Khan — Truck Driver', location: 'Video call', startAt: daysFromNowAt(4, 13), endAt: daysFromNowAt(4, 14), allDay: false },
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
    (await prisma.authUser.findUnique({ where: { email: `${email}@${SEED_USER_DOMAIN}` } }))?.id ?? null;
  const hr = await byEmail('staff-hr_officer');
  const gro = await byEmail('staff-gro_officer');
  if (!hr || !gro) return 0;

  const rows = [
    { id: 'aa000001-0000-4000-8000-000000000001', recipientUserId: hr, category: 'document_expiry' as const, titleAr: 'إقامة منتهية', titleEn: 'Iqama expired', bodyAr: 'انتهت إقامة سيد علي قبل ٨ أيام.', bodyEn: 'Syed Ali\'s iqama expired 8 days ago.', readAt: null },
    { id: 'aa000001-0000-4000-8000-000000000002', recipientUserId: hr, category: 'document_expiry' as const, titleAr: 'إقامة تنتهي قريباً', titleEn: 'Iqama expiring soon', bodyAr: 'تنتهي إقامة جوزيف سانتوس خلال ٥ أيام.', bodyEn: 'Joseph Santos\'s iqama expires in 5 days.', readAt: null },
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

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV=production. The seed is development-only.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL ?? ''),
  });

  try {
    // Client companies first — they originate the client_ids everything else
    // references (no FK across modules, so order is for clarity, not integrity).
    const clientCount = await seedClients(prisma);
    const employeeCount = await seedEmployees(prisma);
    const documentCount = await seedDocuments(prisma);

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
    const requestCount = await seedRequests(prisma);
    const taskCount = await seedTasks(prisma);
    const vacancyCount = await seedVacancies(prisma);
    const candidateCount = await seedCandidates(prisma);
    const groCount = await seedGroProcesses(prisma);
    const calendarCount = await seedCalendarEvents(prisma);
    const purgedNotifications = await purgeOrphanNotifications(prisma);
    const notificationCount = await seedNotifications(prisma);

    const rowCount = await prisma.coreScopeCheck.count({
      where: { note: { startsWith: 'seed:' } },
    });
    const roleCount = STAFF_ROLES.length + CLIENT_REP_ASSIGNMENTS.length;
    process.stdout.write(
      `Seed complete: ${clientCount} client companies; ${employeeCount} employees; ${documentCount} documents; ${requestCount} requests; ${taskCount} tasks; ${vacancyCount} vacancies; ${candidateCount} candidates; ${groCount} GRO processes; ${calendarCount} calendar events; ${rowCount} scope-check rows ` +
        `${notificationCount} notifications (purged ${purgedNotifications} orphans); ` +
        `across clients A (${SEED_CLIENT_A}) and B (${SEED_CLIENT_B}); ${userCount} auth users ` +
        `(${STAFF_ROLES.length} staff roles + ${CLIENT_REP_ASSIGNMENTS.length} client reps, ` +
        `${roleCount}/${STAFF_ROLES.length + CLIENT_ROLES.length} distinct roles covered).\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
