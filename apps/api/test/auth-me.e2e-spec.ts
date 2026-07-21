import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEnrolledStaff,
  loginAsStaff,
} from './helpers/login';

// AUTH-08: GET /auth/me returns the current actor + capability list, or 401.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';

interface MeBody {
  userId: string;
  principalType: 'staff' | 'client_rep';
  role: string;
  clientId: string | null;
  permissions: string[];
}

describe('GET /auth/me (AUTH-08, e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await app.close();
  });

  const me = (cookie?: string) => {
    const r = request(app.getHttpServer()).get('/auth/me');
    return cookie ? r.set('Cookie', cookie) : r;
  };

  it('unauthenticated → 401', async () => {
    await me().expect(401);
  });

  it('non-admin staff → own identity + capabilities (client.read, not audit.read)', async () => {
    const staff = await loginAsStaff(app, 'hr_officer');
    const res = await me(staff.cookie).expect(200);
    const body = res.body as MeBody;
    expect(body).toMatchObject({
      userId: staff.userId,
      principalType: 'staff',
      role: 'hr_officer',
      clientId: null,
    });
    expect(body.permissions).toContain('client.read');
    expect(body.permissions).not.toContain('audit.read');
    expect(body.permissions).not.toContain('client.create');
  });

  it('admin → elevated capabilities (audit.read + client.create)', async () => {
    const admin = await loginAsEnrolledStaff(app, 'company_admin');
    const body = (await me(admin.cookie).expect(200)).body as MeBody;
    expect(body.role).toBe('company_admin');
    expect(body.permissions).toEqual(
      expect.arrayContaining(['audit.read', 'client.create', 'client.update', 'client.delete']),
    );
  });

  it('client rep → principal_type client_rep + client binding + client caps', async () => {
    const rep = await loginAsClientRep(app, CLIENT_A, 'client_admin');
    const body = (await me(rep.cookie).expect(200)).body as MeBody;
    expect(body).toMatchObject({ principalType: 'client_rep', clientId: CLIENT_A });
    expect(body.permissions).toEqual(
      expect.arrayContaining(['scope-check.read', 'client-user.create']),
    );
    // A client rep never has staff/admin capabilities.
    expect(body.permissions).not.toContain('client.create');
  });
});
