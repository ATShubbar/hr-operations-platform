// Input to CandidatesService (REC-03). A candidate always starts at stage
// `applied` — advancing the pipeline (screening → interview → offer → hired…) is
// the workflow concern of REC-04, so `stage` is not accepted at create.
// `clientId` is DERIVED from the vacancy by the service, never supplied.
// `createdByUserId` comes from the request context via the caller.
export interface CreateCandidateInput {
  vacancyId: string;
  nameAr: string;
  nameEn: string;
  nationality?: string | null;
  email?: string | null;
  phone?: string | null;
  cvDocumentId?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
}

// Editable core fields (REC-04). Stage is NOT here — advancing it is the pipeline
// workflow concern. Every field optional (partial update); nullable fields accept
// null to clear.
export interface UpdateCandidateInput {
  nameAr?: string;
  nameEn?: string;
  nationality?: string | null;
  email?: string | null;
  phone?: string | null;
  cvDocumentId?: string | null;
  notes?: string | null;
}
