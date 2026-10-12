// Public surface of the history module (ADR-003). A leaf — nothing imports it
// but the application root.
export { HistoryModule } from './history.module';
// HIST-01: what of an entry a History reader may see — exported for its tests.
export { detailsFor } from './domain/history-details';
