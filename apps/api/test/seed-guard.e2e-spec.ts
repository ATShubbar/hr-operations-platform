import { describe, expect, it } from 'vitest';
import { DEV_SEED_PASSWORD, seedPasswordFor } from '../prisma/seed-guard';

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
      seedPasswordFor({ NODE_ENV: 'production', SEED_TARGET: 'uat', SEED_PASSWORD: DEV_SEED_PASSWORD }),
    ).toThrow(/SEED_PASSWORD/);
  });

  it('UAT with an explicit target and a supplied password uses that password', () => {
    const pw = 'Abc123def456ghi789jkl012';
    expect(seedPasswordFor({ NODE_ENV: 'production', SEED_TARGET: 'uat', SEED_PASSWORD: pw })).toBe(pw);
  });
});
