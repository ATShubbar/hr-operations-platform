import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { CaptureEmailTransport, EMAIL_TRANSPORT } from '../src/modules/notifications/public-api';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  HELPER_EMAIL_PREFIX,
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
} from './helpers/login';

// SS-06a (ADR-011): employee accounts — invitation, first password, reset,
// deactivation — and the session-revocation fix every deactivation path needed.
//
// Companies and employees are created HERE (one opted in, one not). Account
// emails are read from the dev capture transport — the same seam SMTP will use.

const MARK = 'SS-06a-test';

describe('Employee accounts (SS-06a, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: CaptureEmailTransport;
  const co = { on: '', off: '' };
  const http = () => request(app.getHttpServer());
  const me = (cookie: string) => http().get('/auth/me').set('Cookie', cookie);
  // Lower-case on purpose: the API stores addresses lower-cased (one email, one
  // account), and the capture is keyed by what was actually sent.
  const addr = () => `${HELPER_EMAIL_PREFIX}${MARK}-${randomUUID()}@example.com`.toLowerCase();

  // Every staff call below is made by ONE hr_officer session.
  let hr: Awaited<ReturnType<typeof loginAsStaff>> | undefined;
  const staff = async () => (hr ??= await loginAsStaff(app, 'hr_officer'));

  const person = async (clientId: string, extra = {}) =>
    (
      await prisma.employee.create({
        data: {
          clientId,
          nameAr: 'اختبار',
          nameEn: `${MARK} ${randomUUID()}`,
          nationality: 'EG',
          contractType: 'unlimited',
          ...extra,
        },
      })
    ).id;

  const invite = async (employeeId: string, email: string) =>
    http()
      .post(`/employee-accounts/${employeeId}/invite`)
      .set('Cookie', (await staff()).cookie)
      .send({ email });

  // The token from the LAST email to an address — read from the link's fragment.
  const tokenFor = (email: string): string => {
    const sent = mail.forRecipient(email);
    const text = sent[sent.length - 1]?.text ?? '';
    const m = /#token=([A-Za-z0-9_-]+)/.exec(text);
    if (!m?.[1]) throw new Error(`no token mailed to ${email}`);
    return m[1];
  };
  const setPassword = (token: string, password: string) =>
    http().post('/auth/account/set-password').send({ token, password });
  const login = (email: string, password: string) =>
    http().post('/auth/login').send({ email, password });
  const cookieOf = (res: request.Response) =>
    ((res.headers['set-cookie'] as unknown as string[]) ?? [])
      .find((c) => c.startsWith('hr_session='))
      ?.split(';')[0] ?? '';

  // Invite → set password → signed-in session, in one step.
  const activeEmployee = async (password = 'correct horse battery') => {
    const employeeId = await person(co.on);
    const email = addr();
    await invite(employeeId, email).then((r) => expect(r.status).toBe(200));
    await setPassword(tokenFor(email), password).expect(200);
    const cookie = cookieOf(await login(email, password).expect(200));
    return { employeeId, email, password, cookie };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    mail = app.get<CaptureEmailTransport>(EMAIL_TRANSPORT);
    co.on = (
      await prisma.client.create({ data: { nameAr: 'شركة مفعلة', nameEn: `${MARK} On` } })
    ).id;
    co.off = (
      await prisma.client.create({ data: { nameAr: 'غير مفعلة', nameEn: `${MARK} Off` } })
    ).id;
    await prisma.clientSetting.create({
      data: { clientId: co.on, key: 'flag.employee-self-service', value: true },
    });
  });

  afterAll(async () => {
    await cleanupHelperUsers(app); // cascades to auth_account_tokens
    await prisma.employee.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    await prisma.clientSetting.deleteMany({ where: { clientId: { in: [co.on, co.off] } } });
    await prisma.client.deleteMany({ where: { id: { in: [co.on, co.off] } } });
    await app.close();
  });

  // ---- 1. The pre-existing gap: deactivation must END live sessions ---------

  describe('deactivation and role changes end live sessions — every account type', () => {
    it('client user: deactivated by their Client Admin → the open session is 401 at once', async () => {
      const admin = await loginAsClientRep(app, co.on, 'client_admin');
      const victim = await loginAsClientRep(app, co.on, 'client_user');
      await me(victim.cookie).expect(200);
      await http().delete(`/client-users/${victim.userId}`).set('Cookie', admin.cookie).expect(200);
      await me(victim.cookie).expect(401);
    });

    it('client user: a ROLE change also ends the session (the session caches the role)', async () => {
      const admin = await loginAsClientRep(app, co.on, 'client_admin');
      const victim = await loginAsClientRep(app, co.on, 'client_user');
      await http()
        .patch(`/client-users/${victim.userId}`)
        .set('Cookie', admin.cookie)
        .send({ role: 'client_admin' })
        .expect(200);
      await me(victim.cookie).expect(401);
    });

    it('staff: disabled, demoted, or deactivated by the System Admin → 401 at once', async () => {
      const sysadmin = await loginAsEnrolledStaff(app, 'system_admin');
      const disabled = await loginAsStaff(app, 'recruiter');
      const demoted = await loginAsStaff(app, 'recruiter');
      const deactivated = await loginAsStaff(app, 'recruiter');
      await http()
        .patch(`/staff-users/${disabled.userId}`)
        .set('Cookie', sysadmin.cookie)
        .send({ status: 'disabled' })
        .expect(200);
      await http()
        .patch(`/staff-users/${demoted.userId}`)
        .set('Cookie', sysadmin.cookie)
        .send({ role: 'read_only' })
        .expect(200);
      await http()
        .delete(`/staff-users/${deactivated.userId}`)
        .set('Cookie', sysadmin.cookie)
        .expect(200);
      await me(disabled.cookie).expect(401);
      await me(demoted.cookie).expect(401);
      await me(deactivated.cookie).expect(401);
    });

    it('staff: a change that is neither (display name) leaves the session alone', async () => {
      const sysadmin = await loginAsEnrolledStaff(app, 'system_admin');
      const renamed = await loginAsStaff(app, 'recruiter');
      await http()
        .patch(`/staff-users/${renamed.userId}`)
        .set('Cookie', sysadmin.cookie)
        .send({ displayName: 'Renamed' })
        .expect(200);
      await me(renamed.cookie).expect(200);
    });

    it('employee: deactivated by staff → 401 at once, and the account cannot sign in again', async () => {
      const e = await activeEmployee();
      await me(e.cookie).expect(200);
      const res = await http()
        .patch(`/employee-accounts/${e.employeeId}`)
        .set('Cookie', (await staff()).cookie)
        .send({ status: 'disabled' })
        .expect(200);
      expect(res.body.status).toBe('disabled');
      await me(e.cookie).expect(401);
      await login(e.email, e.password).expect(401);
    });
  });

  // ---- 2. Invitation → first password → sign-in ---------------------------

  it('invite → email captured → cannot sign in yet → set password → signs in as the employee', async () => {
    const employeeId = await person(co.on);
    const email = addr();
    const inv = await invite(employeeId, email);
    expect(inv.status).toBe(200);
    expect(inv.body).toMatchObject({
      employeeId,
      email,
      status: 'invited',
      passwordSet: false,
      emailSent: true,
    });

    const sent = mail.forRecipient(email);
    expect(sent).toHaveLength(1);
    // Arabic by default (the company has no English override); the link carries
    // the token in the FRAGMENT, never the query string.
    expect(sent[0]?.text).toContain('/ar/account/set-password#token=');
    expect(sent[0]?.text).not.toContain('?token=');

    await login(email, 'correct horse battery').expect(401); // invited ≠ active
    await setPassword(tokenFor(email), 'correct horse battery').expect(200);
    const res = await login(email, 'correct horse battery').expect(200);
    const body = (await me(cookieOf(res)).expect(200)).body;
    expect(body).toMatchObject({ principalType: 'employee', employeeId });

    const acct = (
      await http()
        .get(`/employee-accounts/${employeeId}`)
        .set('Cookie', (await staff()).cookie)
        .expect(200)
    ).body;
    expect(acct).toMatchObject({ status: 'active', passwordSet: true });
  });

  it('the database stores only a HASH of the token', async () => {
    const employeeId = await person(co.on);
    const email = addr();
    await invite(employeeId, email);
    const token = tokenFor(email);
    const rows = await prisma.authAccountToken.findMany({ where: { user: { email } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toContain(token);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a link works ONCE', async () => {
    const employeeId = await person(co.on);
    const email = addr();
    await invite(employeeId, email);
    const token = tokenFor(email);
    await setPassword(token, 'first password value').expect(200);
    await setPassword(token, 'second password value').expect(400);
  });

  it('an EXPIRED link is refused', async () => {
    const employeeId = await person(co.on);
    const email = addr();
    await invite(employeeId, email);
    await prisma.authAccountToken.updateMany({
      where: { user: { email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await setPassword(tokenFor(email), 'too late password').expect(400);
  });

  it('re-inviting replaces the link: the older one stops working, the new one works', async () => {
    const employeeId = await person(co.on);
    const email = addr();
    await invite(employeeId, email);
    const first = tokenFor(email);
    await invite(employeeId, email).then((r) => expect(r.status).toBe(200));
    const second = tokenFor(email);
    expect(second).not.toBe(first);
    await setPassword(first, 'old link password').expect(400);
    await setPassword(second, 'new link password').expect(200);
  });

  it('a short password and an unknown token → 400', async () => {
    const employeeId = await person(co.on);
    const email = addr();
    await invite(employeeId, email);
    await setPassword(tokenFor(email), 'short').expect(400);
    await setPassword('x'.repeat(43), 'long enough password').expect(400);
  });

  // ---- 3. When an invitation is refused ------------------------------------

  it('refused: company not opted in · terminated · already active · address in use · unknown employee', async () => {
    const cookie = (await staff()).cookie;
    await invite(await person(co.off), addr()).then((r) => expect(r.status).toBe(409));
    await invite(await person(co.on, { employmentStatus: 'terminated' }), addr()).then((r) =>
      expect(r.status).toBe(409),
    );
    const active = await activeEmployee();
    await invite(active.employeeId, addr()).then((r) => expect(r.status).toBe(409));
    await invite(await person(co.on), active.email).then((r) => expect(r.status).toBe(409));
    await http()
      .post(`/employee-accounts/${randomUUID()}/invite`)
      .set('Cookie', cookie)
      .send({ email: addr() })
      .expect(404);
  });

  it('only Company Admin / HR Officer manage accounts: recruiter, client rep and employee → 403', async () => {
    const employeeId = await person(co.on);
    const recruiter = await loginAsStaff(app, 'recruiter');
    const rep = await loginAsClientRep(app, co.on, 'client_admin');
    const emp = await loginAsEmployee(app);
    for (const who of [recruiter, rep, emp]) {
      await http()
        .post(`/employee-accounts/${employeeId}/invite`)
        .set('Cookie', who.cookie)
        .send({ email: addr() })
        .expect(403);
      await http().get(`/employee-accounts/${employeeId}`).set('Cookie', who.cookie).expect(403);
    }
  });

  // ---- 4. Forgot password ---------------------------------------------------

  it('reset: an active employee gets a link; the new password works, the old one and old sessions do not', async () => {
    const e = await activeEmployee('original password one');
    await http().post('/me/password-reset').send({ email: e.email }).expect(202);
    await setPassword(tokenFor(e.email), 'brand new password').expect(200);
    await me(e.cookie).expect(401); // a reset ends every existing session
    await login(e.email, 'original password one').expect(401);
    await login(e.email, 'brand new password').expect(200);
  });

  it('reset reveals nothing: unknown address, a staff address and garbage all get the same 202 and NO email', async () => {
    const before = mail.sent.length;
    const staffUser = await loginAsStaff(app, 'hr_officer');
    for (const email of [addr(), staffUser.email, 'not-an-email']) {
      const res = await http().post('/me/password-reset').send({ email }).expect(202);
      expect(res.body).toEqual({});
    }
    expect(mail.sent.length).toBe(before);
  });

  it('reset is throttled to 3 per hour per account — the 4th answers the same and sends nothing', async () => {
    const e = await activeEmployee();
    for (let i = 0; i < 4; i++)
      await http().post('/me/password-reset').send({ email: e.email }).expect(202);
    // 1 invitation + 3 resets — the 4th request produced no mail.
    expect(mail.forRecipient(e.email)).toHaveLength(4);
  });

  // ---- 5. Termination closes the account ------------------------------------

  it('terminating the employee ends their session at once and disables the account', async () => {
    const e = await activeEmployee();
    await me(e.cookie).expect(200);
    await http()
      .delete(`/employees/${e.employeeId}`)
      .set('Cookie', (await staff()).cookie)
      .expect(200);
    await me(e.cookie).expect(401);
    const acct = (
      await http()
        .get(`/employee-accounts/${e.employeeId}`)
        .set('Cookie', (await staff()).cookie)
        .expect(200)
    ).body;
    expect(acct.status).toBe('disabled');
    // And it cannot be reactivated while the record is terminated.
    await http()
      .patch(`/employee-accounts/${e.employeeId}`)
      .set('Cookie', (await staff()).cookie)
      .send({ status: 'active' })
      .expect(409);
  });

  // ---- 6. Deactivate / reactivate -------------------------------------------

  it('deactivating an INVITED account kills its link; reactivating returns it to invited, not active', async () => {
    const employeeId = await person(co.on);
    const email = addr();
    await invite(employeeId, email);
    const token = tokenFor(email);
    const cookie = (await staff()).cookie;
    await http()
      .patch(`/employee-accounts/${employeeId}`)
      .set('Cookie', cookie)
      .send({ status: 'disabled' })
      .expect(200);
    await setPassword(token, 'should not work now').expect(400);
    const back = (
      await http()
        .patch(`/employee-accounts/${employeeId}`)
        .set('Cookie', cookie)
        .send({ status: 'active' })
        .expect(200)
    ).body;
    expect(back.status).toBe('invited');
  });

  it('reactivating an account whose holder HAD set a password returns it to active', async () => {
    const e = await activeEmployee();
    const cookie = (await staff()).cookie;
    await http()
      .patch(`/employee-accounts/${e.employeeId}`)
      .set('Cookie', cookie)
      .send({ status: 'disabled' })
      .expect(200);
    const back = (
      await http()
        .patch(`/employee-accounts/${e.employeeId}`)
        .set('Cookie', cookie)
        .send({ status: 'active' })
        .expect(200)
    ).body;
    expect(back.status).toBe('active');
    await login(e.email, e.password).expect(200);
  });

  it('every account change is audited; the token never enters the audit trail', async () => {
    const employeeId = await person(co.on);
    const email = addr();
    await invite(employeeId, email);
    const token = tokenFor(email);
    await setPassword(token, 'audited password').expect(200);
    const rows = await prisma.$queryRaw<Array<{ resource: string; action: string; body: string }>>`
      SELECT resource, action, coalesce("after"::text, '') AS body FROM aud_entries
      WHERE ("after"->>'email' = ${email}) OR (resource = 'auth-account' AND actor_id = (SELECT id FROM auth_users WHERE email = ${email}))`;
    expect(rows.map((r) => `${r.resource}.${r.action}`).sort()).toEqual([
      'auth-account.activate',
      'employee-user.invite',
    ]);
    expect(JSON.stringify(rows)).not.toContain(token);
  });
});
