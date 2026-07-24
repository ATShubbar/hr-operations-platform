// Input to CalendarService.create (CAL-01). `ownerUserId` is taken from the request
// context by the caller (the creator owns the event), never free input.
export interface CreateCalendarEventInput {
  ownerUserId: string;
  clientId?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
}

// Editable fields (CAL-02). Every field optional (partial update); nullable fields
// accept null to clear. Ownership is not editable.
export interface UpdateCalendarEventInput {
  clientId?: string | null;
  title?: string;
  description?: string | null;
  location?: string | null;
  startAt?: Date;
  endAt?: Date;
  allDay?: boolean;
}
