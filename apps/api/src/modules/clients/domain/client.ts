// Client-company domain inputs (CLIENT-01/02; the profile since PROF-01,
// ADR-019). The persistence shape is Prisma's Client model; these are the
// module's create/update contracts. Bilingual names per ADR-005; status is the
// lifecycle (active | inactive).
//
// In a profile input `undefined` means "leave it", `null` means "clear it".
import type {
  ClientCity,
  ClientPortal,
  ClientSector,
  NitaqatBand,
  ResponseCommitment,
  ServiceTier,
} from '@hr/contracts';

export type ClientStatusValue = 'active' | 'inactive';

export interface ClientProfileInput {
  crNumber?: string | null;
  city?: ClientCity | null;
  sector?: ClientSector | null;
  /** A band always travels with the day it was checked; null clears both. */
  nitaqat?: { band: NitaqatBand; checkedOn: Date } | null;
  registrations?: {
    qiwaEstablishment?: string | null;
    gosiEstablishment?: string | null;
    vatNumber?: string | null;
  };
  contact?: {
    nameEn?: string | null;
    nameAr?: string | null;
    role?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  /** The whole list — replaced, not patched. */
  signatories?: Array<{ name: string; role: string }>;
  /** Portal NAMES only (never a credential); the whole list. */
  portals?: ClientPortal[];
  service?: {
    officerUserId?: string | null;
    tier?: ServiceTier | null;
    responseCommitment?: ResponseCommitment | null;
    termStart?: Date | null;
    termEnd?: Date | null;
  };
}

export interface CreateClientInput extends ClientProfileInput {
  nameAr: string;
  nameEn: string;
  status?: ClientStatusValue;
}

export interface UpdateClientInput extends ClientProfileInput {
  nameAr?: string;
  nameEn?: string;
  status?: ClientStatusValue;
}

/** The named officer as a reader sees them: a name and a role, nothing else. */
export interface ClientOfficer {
  name: string | null;
  role: string;
}
