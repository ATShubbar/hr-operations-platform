// Public surface of the configuration module (ADR-003). ConfigService is how
// every other module reads settings — the catalog and stores stay private.
export { ConfigurationModule } from './configuration.module';
export { ConfigService } from './application/config.service';
