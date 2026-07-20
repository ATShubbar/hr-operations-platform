import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ModulesContainer } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PERMISSION_KEY } from '../src/auth/permissions.decorator';
import { PERMISSIONS } from '../src/modules/auth/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

const CLIENT_A = '11111111-1111-4111-8111-111111111111';

describe('Policy service + permission catalog (AUTH-04, e2e)', () => {
  let app: INestApplication;
  let staff: TestPrincipal; // hr_officer — holds example.read
  let rep: TestPrincipal; // client_admin — holds scope-check.read

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    staff = await loginAsStaff(app, 'hr_officer');
    rep = await loginAsClientRep(app, CLIENT_A, 'client_admin');
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await app.close();
  });

  it('staff role holding the permission → 200', async () => {
    await request(app.getHttpServer())
      .get('/example/greeting')
      .set('Cookie', staff.cookie)
      .expect(200);
  });

  it('staff role LACKING the permission → 403 (scope-check is client-only)', async () => {
    const res = await request(app.getHttpServer())
      .get('/scope-check')
      .set('Cookie', staff.cookie)
      .expect(403);
    expect(res.body.message).toBe('Permission denied');
  });

  it('client rep hitting a staff-only permission → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/example/greeting')
      .set('Cookie', rep.cookie)
      .expect(403);
    expect(res.body.message).toBe('Permission denied');
  });

  it('client rep with the client permission → 200 (through real RLS scope)', async () => {
    await request(app.getHttpServer()).get('/scope-check').set('Cookie', rep.cookie).expect(200);
  });

  it('CATALOG COVERAGE: every @RequirePermission value in the app is declared', () => {
    const catalog = PERMISSIONS as readonly string[];
    const undeclared: string[] = [];

    const modules = app.get(ModulesContainer);
    for (const module of modules.values()) {
      for (const controller of module.controllers.values()) {
        const proto = (controller.metatype as { prototype?: Record<string, unknown> })
          ?.prototype;
        if (!proto) continue;
        for (const name of Object.getOwnPropertyNames(proto)) {
          if (name === 'constructor') continue;
          const handler = proto[name];
          if (typeof handler !== 'function') continue;
          const permission = Reflect.getMetadata(PERMISSION_KEY, handler) as
            | string
            | undefined;
          if (permission && !catalog.includes(permission)) {
            undeclared.push(`${controller.name ?? 'controller'}.${name}: ${permission}`);
          }
        }
      }
    }

    expect(
      undeclared,
      `Permissions used but not in the catalog (add to domain/permissions.ts): ${undeclared.join(', ')}`,
    ).toEqual([]);
  });
});
