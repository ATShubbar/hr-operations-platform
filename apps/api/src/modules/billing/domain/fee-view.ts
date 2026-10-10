import type { FeeAuthority, FeeResponse } from '@hr/contracts';
import type { Prisma } from '../../../generated/prisma/client';
import type { FeeModel as FeeRecord } from '../../../generated/prisma/models';

// The ONE mapping from a ledger row to what leaves the API, and the audit
// snapshot (BILL-01, ADR-020). People are NAMES here, never account ids.

const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

export interface FeeNames {
  employees: ReadonlyMap<string, { nameEn: string; nameAr: string }>;
  users: ReadonlyMap<string, string | null>;
}

function sourceOf(row: FeeRecord): FeeResponse['source'] {
  if (row.sourceKind === 'sequence_step') {
    return {
      kind: 'sequence_step',
      sequenceId: row.sequenceId ?? '',
      sequenceKind: row.sequenceKind === 'final_exit' ? 'final_exit' : 'onboarding',
      stepKey: row.stepKey ?? '',
    };
  }
  if (row.sourceKind === 'procedure') {
    return {
      kind: 'procedure',
      processId: row.processId ?? '',
      procedureType: row.procedureType ?? 'other',
    };
  }
  return { kind: 'manual', label: row.label ?? '' };
}

export function toFeeResponse(row: FeeRecord, names: FeeNames): FeeResponse {
  const person = row.employeeId ? names.employees.get(row.employeeId) : undefined;
  return {
    id: row.id,
    ref: row.ref,
    clientId: row.clientId,
    employee:
      row.employeeId && person
        ? { id: row.employeeId, name: { ar: person.nameAr, en: person.nameEn } }
        : null,
    source: sourceOf(row),
    authority: row.authority as FeeAuthority,
    amountHalalas: row.amountHalalas,
    paidOn: dateOnly(row.paidOn),
    status: row.status,
    recordedBy: row.recordedByUserId ? (names.users.get(row.recordedByUserId) ?? null) : null,
    recordedAt: row.createdAt.toISOString(),
    voided:
      row.status === 'void' && row.voidedAt
        ? {
            at: row.voidedAt.toISOString(),
            by: row.voidedByUserId ? (names.users.get(row.voidedByUserId) ?? null) : null,
            reason: row.voidReason ?? '',
          }
        : null,
  };
}

// Money is the point of this trail, so before → after carries the amounts.
export function feeSnapshot(row: FeeRecord): Prisma.InputJsonValue {
  return {
    ref: row.ref,
    employeeId: row.employeeId,
    sourceKind: row.sourceKind,
    stepKey: row.stepKey,
    procedureType: row.procedureType,
    label: row.label,
    authority: row.authority,
    amountHalalas: row.amountHalalas,
    paidOn: dateOnly(row.paidOn),
    status: row.status,
    voidReason: row.voidReason,
  };
}
