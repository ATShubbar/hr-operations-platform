// The shape every domain event shares (ADR-004): a `name` (the past/present-tense
// fact key the bus routes on) plus a `correlationId` so a request's trace flows
// through the async hop into consumers' logs. Concrete events are classes owned
// by the PUBLISHING module and exported via its public-api; consumers subscribe
// to `<Event>.NAME`.
export interface DomainEvent {
  readonly name: string;
  readonly correlationId: string | null;
}
