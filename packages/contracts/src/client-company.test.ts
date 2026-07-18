import { describe, expect, it } from 'vitest';
import { clientCompanySchema, type ClientCompany } from './client-company.js';

const validPayload: ClientCompany = {
  id: 'f6a7c8d0-1234-4b5c-9d0e-abcdef012345',
  name: { ar: 'شركة المثال', en: 'Example Company' },
  status: 'active',
};

describe('clientCompanySchema', () => {
  it('accepts a valid payload', () => {
    const result = clientCompanySchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects a payload missing the Arabic name', () => {
    const result = clientCompanySchema.safeParse({
      ...validPayload,
      name: { ar: '', en: 'Example Company' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload with a malformed id', () => {
    const result = clientCompanySchema.safeParse({ ...validPayload, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
