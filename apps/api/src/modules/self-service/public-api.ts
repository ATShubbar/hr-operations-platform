// Employee self-service (ADR-011). Exposes only the module itself: nothing else
// in the system may depend on self-service — it is a leaf delivery surface.
export { SelfServiceModule } from './self-service.module';
