// Input to VacanciesService (REC-01). A vacancy is created `draft` — advancing it
// (draft → open → filled/closed) is the approval/status concern of REC-02, so
// `status` is not accepted at create. `openedByUserId` is taken from the request
// context by the caller, never from input.
export interface CreateVacancyInput {
  clientId: string;
  titleAr: string;
  titleEn: string;
  description?: string | null;
  department?: string | null;
  headcount?: number;
  openedByUserId?: string | null;
}

// Editable core fields (REC-02). Status is NOT here — advancing it (incl. approve)
// is its own workflow concern. Every field optional (partial update);
// description/department accept null to clear.
export interface UpdateVacancyInput {
  titleAr?: string;
  titleEn?: string;
  description?: string | null;
  department?: string | null;
  headcount?: number;
}
