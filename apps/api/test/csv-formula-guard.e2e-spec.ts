import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { toCsvDocument } from '../src/csv/csv';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsEnrolledStaff, type TestPrincipal } from './helpers/login';

// CSV-01: a spreadsheet RUNS a cell that opens with = + - or @ (or a tab or a
// carriage return) as a formula. Text someone typed — a company name, an
// account's name — must reach the file as text, in EVERY export. The guard lives
// in the one CSV writer, so an export cannot forget it.

const body = (csv: string) => csv.slice(1); // without the BOM
const FORMULA_CLIENT = '=HYPERLINK("http://x","Al Noor")';
const PLUS_CLIENT = '+966 Trading';
const AT_ACTOR = '@SUM(A1:A9)';

describe('CSV formula guard (CSV-01)', () => {
  describe('the writer', () => {
    it('writes a text cell that opens with = + - @, a tab or a carriage return as text', () => {
      for (const start of ['=', '+', '-', '@', '\t', '\r']) {
        const cell = `${start}cmd`;
        const line = body(toCsvDocument([[cell]])).replace(/\r\n$/, '');
        // The apostrophe comes first; a cell holding a carriage return is quoted too.
        expect(line.replace(/^"/, '').startsWith(`'${start}`), JSON.stringify(cell)).toBe(true);
      }
    });

    it('leaves numbers as numbers — a negative one is not text', () => {
      expect(body(toCsvDocument([[-12.5, 0, 7]]))).toBe('-12.5,0,7\r\n');
    });

    it('leaves ordinary text, dates and empty cells exactly as they were', () => {
      expect(body(toCsvDocument([['Al Noor', '2026-10-12', null, 'a-b', 'x=y', '']]))).toBe(
        'Al Noor,2026-10-12,,a-b,x=y,\r\n',
      );
    });

    it('guards first, then quotes — a formula holding a comma or a quote', () => {
      expect(body(toCsvDocument([['=A1,"B"']]))).toBe(`"'=A1,""B"""\r\n`);
    });

    it('does not guard a cell twice', () => {
      expect(body(toCsvDocument([[`'=A1`]]))).toBe(`'=A1\r\n`);
    });
  });

  describe('the exports', () => {
    let app: INestApplication;
    let owner: PrismaClient;
    let admin: TestPrincipal;
    const clientIds: string[] = [];
    const actorId = randomUUID();

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      await app.listen(0, '127.0.0.1');
      owner = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
      });
      admin = await loginAsEnrolledStaff(app, 'administrator');
      for (const nameEn of [FORMULA_CLIENT, PLUS_CLIENT]) {
        clientIds.push((await owner.client.create({ data: { nameAr: 'شركة', nameEn } })).id);
      }
      // An account whose NAME is a formula, and one thing it did.
      await owner.authUser.create({
        data: {
          id: actorId,
          email: `csv-guard-${actorId}@e2e.test`,
          displayName: AT_ACTOR,
          passwordHash: 'x',
          principalType: 'staff',
          role: 'hr_officer',
        },
      });
      await owner.auditEntry.create({
        data: {
          actorId,
          actorRole: 'hr_officer',
          resource: 'task',
          action: 'create',
          after: { title: '=1+1' },
        },
      });
    });

    afterAll(async () => {
      await owner.auditEntry.deleteMany({
        where: { OR: [{ actorId }, { actorId: admin.userId, action: 'export' }] },
      });
      await owner.authUser.deleteMany({ where: { id: actorId } });
      await owner.client.deleteMany({ where: { id: { in: clientIds } } });
      await cleanupHelperUsers(app);
      await owner.$disconnect();
      await app.close();
    });

    it('a report: a company name that is a formula is written as text', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/workforce/export')
        .set('Cookie', admin.cookie)
        .expect(200);
      expect(res.text).toContain(`"'=HYPERLINK(""http://x"",""Al Noor"")"`);
      expect(res.text).toContain(`'+966 Trading`);
      // No line of the file opens with a formula character.
      for (const line of body(res.text).split('\r\n')) {
        expect(line, line).not.toMatch(/^"?[=+\-@]/);
      }
    });

    it('the audit trail: an account name that is a formula is written as text, and the fingerprint still matches', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit/export')
        .query({ actorId })
        .set('Cookie', admin.cookie)
        .expect(200);
      const lines = body(res.text).trim().split('\r\n');
      expect(lines).toHaveLength(2);
      const cells = lines[1]!.split(',');
      expect(cells[2]).toBe(`'@SUM(A1:A9)`);
      // The recorded values are JSON, which never opens with a formula character.
      expect(res.text).toContain('"{""title"":""=1+1""}"');

      const { createHash } = await import('node:crypto');
      const logged = await owner.auditEntry.findFirst({
        where: { resource: 'audit', action: 'export', actorId: admin.userId },
        orderBy: { id: 'desc' },
      });
      expect((logged?.after as { sha256?: string }).sha256).toBe(
        createHash('sha256').update(res.text, 'utf8').digest('hex'),
      );
    });
  });
});
