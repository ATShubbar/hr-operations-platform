import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { EmployeesService } from '../src/modules/employees/public-api';

// EMP-01: the employee registry. Staff manage all employees via
// EmployeesService (app_staff path). A client-rep may READ ONLY its own
// client's employees (standard client_id-scoped RLS) and never write.

const C1 = 'e1c1c1c1-0000-4000-8000-000000000001';
const C2 = 'e2c2c2c2-0000-4000-8000-000000000002';
const MARK = 'EMP-01-test';

describe('Employee registry — service + RLS (EMP-01, e2e)', () => {
  let app: INestApplication;
  let employees: EmployeesService;
  let owner: PrismaClient; // setup + cleanup (bypasses RLS)
  let clientDb: PrismaClient; // app_client — RLS-enforced

  async function readScoped(scope: string): Promise<Array<{ client_id: string }>> {
    const [, rows] = await clientDb.$transaction([
      clientDb.$executeRaw`SELECT set_config('app.client_id', ${scope}, TRUE)`,
      clientDb.$queryRaw`SELECT client_id FROM emp_employees WHERE name_en LIKE ${`${MARK}%`}`,
    ]);
    return rows as Array<{ client_id: string }>;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    employees = app.get(EmployeesService);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    clientDb = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.CLIENT_DATABASE_URL ?? '' }),
    });
    await owner.employee.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    await owner.employee.createMany({
      data: [
        { clientId: C1, nameAr: 'أ', nameEn: `${MARK} c1-a`, nationality: 'SA', contractType: 'unlimited' },
        { clientId: C1, nameAr: 'ب', nameEn: `${MARK} c1-b`, nationality: 'EG', contractType: 'fixed_term' },
        { clientId: C2, nameAr: 'ج', nameEn: `${MARK} c2-a`, nationality: 'IN', contractType: 'unlimited' },
      ],
    });
  });

  afterAll(async () => {
    await owner.employee.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    await Promise.all([owner.$disconnect(), clientDb.$disconnect()]);
    await app.close();
  });

  it('staff create round-trips core + salary + govdata fields', async () => {
    const created = await employees.create({
      clientId: C1,
      nameAr: 'اختبار موظف',
      nameEn: `${MARK} full`,
      nationality: 'EG',
      contractType: 'fixed_term',
      employmentStatus: 'active',
      basicSalary: 8000,
      iqamaNumber: '2111222333',
      iqamaExpiry: new Date('2027-01-01'),
      gosiRegistrationStatus: 'registered',
    });
    expect(created.id).toBeTruthy();

    const got = await employees.getById(created.id);
    expect(got?.nameEn).toBe(`${MARK} full`);
    expect(Number(got?.basicSalary)).toBe(8000); // Decimal round-trip
    expect(got?.iqamaNumber).toBe('2111222333');
    expect(got?.gosiRegistrationStatus).toBe('registered');

    // Staff see across clients (permissive policy).
    const all = await employees.list();
    expect(all.some((e) => e.id === created.id)).toBe(true);
    const c1Only = await employees.listByClient(C1);
    expect(c1Only.every((e) => e.clientId === C1)).toBe(true);
  });

  it('client-rep reads ONLY its own client’s employees (client_id-scoped RLS)', async () => {
    const rowsC1 = await readScoped(C1);
    expect(rowsC1.length).toBeGreaterThanOrEqual(2);
    expect(rowsC1.every((r) => r.client_id === C1)).toBe(true);
    expect(rowsC1.some((r) => r.client_id === C2)).toBe(false);

    const rowsC2 = await readScoped(C2);
    expect(rowsC2.length).toBeGreaterThanOrEqual(1);
    expect(rowsC2.every((r) => r.client_id === C2)).toBe(true);
    expect(rowsC2.some((r) => r.client_id === C1)).toBe(false);
  });

  it('client-rep cannot write employees (no grant)', async () => {
    await expect(
      clientDb.$executeRawUnsafe(
        `INSERT INTO emp_employees (client_id, name_ar, name_en, nationality, contract_type) VALUES ('${C1}', 'x', 'y', 'SA', 'unlimited')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      clientDb.$executeRawUnsafe(`UPDATE emp_employees SET name_en = 'z' WHERE client_id = '${C1}'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      clientDb.$executeRawUnsafe(`DELETE FROM emp_employees WHERE client_id = '${C1}'`),
    ).rejects.toThrow(/permission denied/i);
  });
});
