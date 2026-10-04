import { describe, expect, it } from 'vitest';
import {
  DEV_SEED_PASSWORD,
  seedEmailFor,
  seedPasswordFor,
  seedStorageFor,
  UAT_SEED_EMAILS,
} from '../prisma/seed-guard';
import { buildSamplePdf } from '../prisma/seed-files';

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

  // SEED-01: the seed writes a real file for every seeded document. In
  // development it uses the same local MinIO defaults as the app; on UAT the
  // storage settings MUST come from outside (Secret Manager) — UAT is never
  // seeded silently without its files.
  it('storage: development falls back to local MinIO; UAT demands every setting', () => {
    expect(seedStorageFor({})).toMatchObject({ endpoint: 'http://localhost:9002', bucket: 'hr-documents' });
    const uat = { NODE_ENV: 'production', SEED_TARGET: 'uat' };
    expect(() => seedStorageFor(uat)).toThrow(/STORAGE_ENDPOINT/);
    const full = {
      ...uat,
      STORAGE_ENDPOINT: 'https://storage.googleapis.com',
      STORAGE_REGION: 'me-central1',
      STORAGE_BUCKET: 'peoplegro-uat-documents',
      STORAGE_ACCESS_KEY: 'GOOG-test',
      STORAGE_SECRET_KEY: 'secret-test',
    };
    expect(seedStorageFor(full)).toMatchObject({ endpoint: 'https://storage.googleapis.com', bucket: 'peoplegro-uat-documents' });
    const { STORAGE_SECRET_KEY: _drop, ...noSecret } = full;
    expect(() => seedStorageFor(noSecret)).toThrow(/STORAGE_SECRET_KEY/);
  });
});

describe('sample PDF (SEED-01)', () => {
  it('is a real PDF a viewer opens: header, one page, an xref whose offsets point at the objects, an EOF', () => {
    const pdf = buildSamplePdf(['PEOPLE&GRO - sample document', 'Iqama — Syed Ali (iqama)', 'Sample data - not a real document']);
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Page');
    // Every xref entry points exactly at "N 0 obj".
    const xref = text.slice(text.indexOf('xref'));
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThanOrEqual(5);
    offsets.forEach((off, i) => expect(text.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    // startxref points at the xref table.
    expect(Number(/startxref\s+(\d+)/.exec(text)![1])).toBe(text.indexOf('xref'));
    // Non-ASCII is replaced, never written raw into the content stream.
    expect(text).toContain('Iqama - Syed Ali');
    expect(pdf.every((byte) => byte < 0x80)).toBe(true);
  });
});

