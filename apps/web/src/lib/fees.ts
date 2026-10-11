import type { FeeReceiptUploadResponse, FeeResponse, FeeSource } from '@hr/contracts';
import {
  FEE_RECEIPT_MAX_BYTES,
  FEE_RECEIPT_TYPES,
  type FeeAuthority,
} from '@hr/contracts/billing-lists';
import { apiFetch } from '@/lib/api';

// Recording a government fee from a dialog (BILL-02, ADR-020).
//
// The fee is a SECOND request, made after the step or procedure has been filed:
// Billing checks the filing through GRO, and GRO knows nothing of Billing. So
// each stage can fail on its own, and the caller is told WHICH — a filed step
// is never rolled back, and a fee is never silently lost: the person is told
// to add it on the client's Fees tab.

/** Who a procedure's fee is usually paid to — the dialog's starting choice. */
export const PROCEDURE_AUTHORITY: Record<string, FeeAuthority> = {
  iqama_issue: 'muqeem',
  iqama_renewal: 'muqeem',
  exit_reentry: 'absher',
  final_exit: 'muqeem',
  profession_change: 'qiwa',
  sponsorship_transfer: 'qiwa',
  work_permit_renewal: 'qiwa',
  other: 'other',
  // INS-04 — the prototype's portals for these procedures.
  medical_insurance_renewal: 'cchi',
  driving_licence_renewal: 'absher',
  driving_licence_conversion: 'absher',
  // DEP-06: a family iqama is renewed where the sponsor's is.
  dependant_iqama_renewal: 'muqeem',
};

export type ReceiptProblem = 'type' | 'size';

/** Why this file cannot be a receipt, or null if it can. */
export function receiptProblem(file: File | null): ReceiptProblem | null {
  if (!file) return null;
  if (!(FEE_RECEIPT_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > FEE_RECEIPT_MAX_BYTES) return 'size';
  return null;
}

export type RecordFeeResult =
  | { ok: true; fee: FeeResponse }
  /** The fee itself was not recorded. `duplicate` = one already exists for this. */
  | { ok: false; stage: 'fee'; duplicate: boolean }
  /** The fee stands; its receipt was not attached (or was refused by the checks). */
  | { ok: false; stage: 'receipt'; fee: FeeResponse };

/** Upload a receipt to a fee that already exists: declare → PUT → confirm. */
export async function attachReceipt(feeId: string, file: File): Promise<FeeResponse | null> {
  try {
    const issued = await apiFetch<FeeReceiptUploadResponse>(`/fees/${feeId}/receipt`, {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, contentType: file.type, sizeBytes: file.size }),
    });
    const put = await fetch(issued.upload.url, {
      method: 'PUT',
      headers: issued.upload.headers,
      body: file,
    });
    if (!put.ok) return null;
    const confirmed = await apiFetch<FeeResponse>(`/fees/${feeId}/receipt/confirm`, {
      method: 'POST',
    });
    return confirmed.receipt?.status === 'available' ? confirmed : null;
  } catch {
    return null;
  }
}

export async function recordFee(input: {
  source: FeeSource;
  authority?: FeeAuthority;
  amountHalalas: number;
  paidOn: string;
  receipt: File | null;
}): Promise<RecordFeeResult> {
  let fee: FeeResponse;
  try {
    fee = await apiFetch<FeeResponse>('/fees', {
      method: 'POST',
      body: JSON.stringify({
        source: input.source,
        ...(input.authority ? { authority: input.authority } : {}),
        amountHalalas: input.amountHalalas,
        paidOn: input.paidOn,
      }),
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    return { ok: false, stage: 'fee', duplicate: status === 409 };
  }
  if (!input.receipt) return { ok: true, fee };
  const withReceipt = await attachReceipt(fee.id, input.receipt);
  return withReceipt ? { ok: true, fee: withReceipt } : { ok: false, stage: 'receipt', fee };
}
