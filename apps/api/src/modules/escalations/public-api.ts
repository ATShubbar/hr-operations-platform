// Public surface of the escalations module (ADR-003; ADR-021).
export { EscalationsModule } from './escalations.module';
export { EscalationsService, type LadderView } from './application/escalations.service';
export {
  buildClientLadder,
  buildEmployeeLadder,
  buildLadder,
  type LadderInput,
  type LadderItem,
  type LadderViewer,
} from './domain/ladder';
