import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { GroProcessesService } from '../src/modules/gro/public-api';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

// GRO-03: the cross-module effects. Completing an expiry-establishing process
// writes its resultingExpiry back to the employee's govdata (GRO operates on
// Employees); every status change notifies the assignee. Direct calls into GRO's
// declared dependencies — no event, no DI cycle.

describe('GRO — completion effects (GRO-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let gro: GroProcessesService;
  let officer: TestPrincipal; // the assignee (a real user)
  let clientId: string;
  let empId: string;
  const createdProcessIds: string[] = [];

  const RESULT_EXPIRY = new Date('2028-06-30');

  // Walk a process not_started → completed (the legal path).
  const complete = async (id: string) => {
    await gro.changeStatus(id, 'in_progress');
    await gro.changeStatus(id, 'submitted');
    await gro.changeStatus(id, 'approved');
    return gro.changeStatus(id, 'completed');
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    gro = app.get(GroProcessesService);
    officer = await loginAsStaff(app, 'gro_officer');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const c = await owner.client.create({
      data: { nameAr: 'شركة الإكمال', nameEn: 'GRO-03 Client', status: 'active' },
    });
    clientId = c.id;
    const e = await owner.employee.create({
      data: { clientId, nameAr: 'م', nameEn: 'Emp', nationality: 'IN', contractType: 'unlimited' },
    });
    empId = e.id;
  });

  afterAll(async () => {
    await owner.notification.deleteMany({ where: { recipientUserId: officer.userId } });
    await owner.auditEntry.deleteMany({ where: { clientId } });
    await owner.groProcess.deleteMany({ where: { id: { in: createdProcessIds } } });
    await owner.employee.deleteMany({ where: { clientId } });
    await cleanupHelperUsers(app);
    await owner.client.delete({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('completing an iqama_renewal writes resultingExpiry to the employee iqamaExpiry', async () => {
    const p = await gro.create({ clientId, employeeId: empId, type: 'iqama_renewal', assigneeUserId: officer.userId });
    createdProcessIds.push(p.id);
    await gro.update(p.id, { resultingExpiry: RESULT_EXPIRY });

    const done = await complete(p.id);
    expect(done?.status).toBe('completed');

    const emp = await owner.employee.findUnique({ where: { id: empId } });
    expect(emp?.iqamaExpiry?.toISOString().slice(0, 10)).toBe('2028-06-30');

    // the govdata write is audited as an employee update
    const empAudit = await owner.auditEntry.findMany({
      where: { resource: 'employee', action: 'gro-completion', clientId },
    });
    expect(empAudit).toHaveLength(1);
  });

  it('notifies the assignee on status change', async () => {
    const notes = await owner.notification.findMany({
      where: { recipientUserId: officer.userId, category: 'general' },
    });
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes.some((n) => /process is now/.test(n.bodyEn))).toBe(true);
  });

  it('a non-mapping type (sponsorship_transfer) completing writes NO govdata', async () => {
    // reset the employee's iqama for a clean assertion
    await owner.employee.update({ where: { id: empId }, data: { workPermitExpiry: null } });
    const p = await gro.create({ clientId, employeeId: empId, type: 'sponsorship_transfer' });
    createdProcessIds.push(p.id);
    await gro.update(p.id, { resultingExpiry: RESULT_EXPIRY }); // set, but the type maps to no field
    await complete(p.id);

    const emp = await owner.employee.findUnique({ where: { id: empId } });
    // sponsorship_transfer maps to no expiry field → workPermitExpiry stays null
    expect(emp?.workPermitExpiry).toBeNull();
  });

  it('completing WITHOUT a resultingExpiry writes nothing', async () => {
    const emp0 = await owner.employee.findUnique({ where: { id: empId } });
    const p = await gro.create({ clientId, employeeId: empId, type: 'work_permit_renewal' }); // no resultingExpiry
    createdProcessIds.push(p.id);
    await complete(p.id);

    const emp1 = await owner.employee.findUnique({ where: { id: empId } });
    expect(emp1?.workPermitExpiry ?? null).toBe(emp0?.workPermitExpiry ?? null); // unchanged (null)
  });
});
