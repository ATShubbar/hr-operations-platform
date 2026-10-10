// Public surface of the clients module (ADR-003).
export { ClientsModule } from './clients.module';
export { ClientsService } from './application/clients.service';
export type { ClientOfficer, CreateClientInput } from './domain/client';
export { toClientResponse, type ClientAudience } from './domain/client-view';
