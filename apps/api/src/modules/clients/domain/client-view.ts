import type { ClientPortal, ClientResponse, ClientSignatory } from '@hr/contracts';
import type { Prisma } from '../../../generated/prisma/client';
import type { ClientModel as ClientRecord } from '../../../generated/prisma/models';
import type { ClientOfficer } from './client';

// The ONE mapping from a client row to what leaves the API (PROF-01, ADR-019) —
// used by the staff controller and the portal's company view, so the two cannot
// drift (the employee-view pattern).
//
// `audience`:
//   staff  — everything, including the named officer's account id (the editor
//            needs it to preselect the officer).
//   client — a client manager reading their OWN company: the same profile, but
//            the officer by name and role only — never a staff account id.

export type ClientAudience = 'staff' | 'client';

const dateOnly = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** The stored list, defensively: anything that is not `{name, role}` is dropped. */
export function signatoriesOf(value: unknown): ClientSignatory[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): ClientSignatory[] => {
    if (typeof v !== 'object' || v === null) return [];
    const { name, role } = v as Record<string, unknown>;
    return typeof name === 'string' && typeof role === 'string' ? [{ name, role }] : [];
  });
}

export function toClientResponse(
  row: ClientRecord,
  officers: ReadonlyMap<string, ClientOfficer>,
  audience: ClientAudience,
): ClientResponse {
  const officer = row.officerUserId ? (officers.get(row.officerUserId) ?? null) : null;
  return {
    id: row.id,
    name: { ar: row.nameAr, en: row.nameEn },
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    crNumber: row.crNumber,
    city: row.city as ClientResponse['city'],
    sector: row.sector as ClientResponse['sector'],
    nitaqat:
      row.nitaqatBand && row.nitaqatCheckedOn
        ? { band: row.nitaqatBand, checkedOn: row.nitaqatCheckedOn.toISOString().slice(0, 10) }
        : null,
    registrations: {
      qiwaEstablishment: row.qiwaEstablishment,
      gosiEstablishment: row.gosiEstablishment,
      vatNumber: row.vatNumber,
    },
    contact: {
      nameEn: row.contactNameEn,
      nameAr: row.contactNameAr,
      role: row.contactRole,
      email: row.contactEmail,
      phone: row.contactPhone,
    },
    signatories: signatoriesOf(row.signatories),
    portals: row.portals as ClientPortal[],
    service: {
      officerUserId: audience === 'staff' ? row.officerUserId : null,
      officer,
      tier: row.serviceTier,
      responseCommitment: row.responseCommitment,
      termStart: dateOnly(row.termStart),
      termEnd: dateOnly(row.termEnd),
    },
  };
}

// The audit snapshot: the whole profile, flat. Company registration numbers and
// a business contact are not restricted fields (ADR-019), so before → after
// carries the values, as client changes always have.
export function clientSnapshot(row: ClientRecord): Prisma.InputJsonValue {
  return {
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    status: row.status,
    crNumber: row.crNumber,
    city: row.city,
    sector: row.sector,
    nitaqatBand: row.nitaqatBand,
    nitaqatCheckedOn: dateOnly(row.nitaqatCheckedOn),
    qiwaEstablishment: row.qiwaEstablishment,
    gosiEstablishment: row.gosiEstablishment,
    vatNumber: row.vatNumber,
    contactNameEn: row.contactNameEn,
    contactNameAr: row.contactNameAr,
    contactRole: row.contactRole,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    signatories: signatoriesOf(row.signatories),
    portals: row.portals,
    officerUserId: row.officerUserId,
    serviceTier: row.serviceTier,
    responseCommitment: row.responseCommitment,
    termStart: dateOnly(row.termStart),
    termEnd: dateOnly(row.termEnd),
  };
}
