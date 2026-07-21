import type { Prisma } from '../../../generated/prisma/client';

// EMP-01: the create shape is Prisma's own (30+ fields from the 0.8 mapping,
// including the client_id scalar). EMP-02 wraps a clean, validated,
// permission-aware HTTP contract around this — for now the staff-path service
// takes the full record shape.
export type CreateEmployeeInput = Prisma.EmployeeUncheckedCreateInput;
