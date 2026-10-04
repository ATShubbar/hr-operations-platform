import { describe, expect, it } from 'vitest';
import { DEV_SEED_PASSWORD, seedEmailFor, seedPasswordFor, UAT_SEED_EMAILS } from '../prisma/seed-guard';

// GCP-06: UAT runs NODE_ENV=production and is reachable from the internet, and
// this repository is public — so the dev seed password is public. The seed may
// run in production mode ONLY for UAT, ONLY when told so explicitly, and ONLY
// with a password supplied from outside the code.
describe('seed guard', () => {
  it('development uses the dev password unless one is supplied', () => {
    expect(seedPasswordFor({})).toBe(DEV_SEED_PASSWORD);
    expect(seedPasswordFor({ NODE_ENV: 'test' })).toBe(DEV_SEED_PASSWORD);
    expect(seedPasswordFor({ SEED_PASSWORD: 'local-override-123' })).toBe('local-override-123');
  });

  it('production refuses without SEED_TARGET=uat — the real production never seeds', () => {
    expect(() => seedPasswordFor({ NODE_ENV: 'production', SEED_PASSWORD: 'x'.repeat(24) })).toThrow(
      /Refusing to seed/,
    );
    expect(() =>
      seedPasswordFor({ NODE_ENV: 'production', SEED_TARGET: 'prod', SEED_PASSWORD: 'x'.repeat(24) }),
    ).toThrow(/Refusing to seed/);
  });

  it('UAT refuses without a supplied password, and never takes the public dev one', () => {
    expect(() => seedPasswordFor({ NODE_ENV: 'production', SEED_TARGET: 'uat' })).toThrow(/SEED_PASSWORD/);
    expect(() =>
      seedPasswordFor({ NODE_ENV: 'production', SEED_TARGET: 'uat', SEED_PASSWORD: 'short' }),
    ).toThrow(/SEED_PASSWORD/);
    expect(() =>
      seedPasswordFor({ NODE_ENV: 'production', SEED_TARGET: 'uat', SEED_PASSWORD: 'Admin!1' }),
    ).toThrow(/SEED_PASSWORD/);
    expect(() =>
      seedPasswordFor({ NODE_ENV: 'production', SEED_TARGET: 'uat', SEED_PASSWORD: DEV_SEED_PASSWORD }),
    ).toThrow(/SEED_PASSWORD/);
  });

  it('UAT with an explicit target and a supplied password uses that password', () => {
    const pw = 'Abc123def456ghi789jkl012';
    expect(seedPasswordFor({ NODE_ENV: 'production', SEED_TARGET: 'uat', SEED_PASSWORD: pw })).toBe(pw);
    // UAT-01: the owner chose a short shared password for UAT (sample data only).
    expect(
      seedPasswordFor({ NODE_ENV: 'production', SEED_TARGET: 'uat', SEED_PASSWORD: 'Admin!123' }),
    ).toBe('Admin!123');
  });

  // UAT-01: on UAT the seed accounts are simple @peopleandgro.com addresses;
  // everywhere else (local dev, CI, the e2e suite) they stay @seed.hr.local.
  it('names seed accounts @seed.hr.local except on UAT', () => {
    expect(seedEmailFor('staff-administrator', {})).toBe('staff-administrator@seed.hr.local');
    expect(seedEmailFor('staff-administrator', { NODE_ENV: 'production' })).toBe(
      'staff-administrator@seed.hr.local',
    );
    const uat = { NODE_ENV: 'production', SEED_TARGET: 'uat' };
    expect(seedEmailFor('staff-administrator', uat)).toBe('admin@peopleandgro.com');
    expect(seedEmailFor('staff-hr_officer', uat)).toBe('hr@peopleandgro.com');
    expect(seedEmailFor('staff-gro_officer', uat)).toBe('gro@peopleandgro.com');
    expect(seedEmailFor('staff-auditor', uat)).toBe('auditor@peopleandgro.com');
    expect(seedEmailFor('client_manager-a', uat)).toBe('client@peopleandgro.com');
    expect(seedEmailFor('employee-a', uat)).toBe('employee@peopleandgro.com');
    // Every UAT address is distinct, and an unmapped account is a loud error,
    // not a silent fall back to the dev domain.
    expect(new Set(Object.values(UAT_SEED_EMAILS)).size).toBe(Object.keys(UAT_SEED_EMAILS).length);
    expect(() => seedEmailFor('staff-unknown', uat)).toThrow(/no UAT address/);
  });
});
