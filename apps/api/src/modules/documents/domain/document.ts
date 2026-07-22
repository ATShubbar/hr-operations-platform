import type { Prisma } from '../../../generated/prisma/client';

// DOC-01: the create shape is Prisma's own, MINUS the fields the service owns:
// `id` (DB-generated) and `storageKey` (the service derives it from the client
// prefix + a random object id — callers never choose where the blob lands).
export type CreateDocumentInput = Omit<
  Prisma.DocumentUncheckedCreateInput,
  'id' | 'storageKey'
>;
