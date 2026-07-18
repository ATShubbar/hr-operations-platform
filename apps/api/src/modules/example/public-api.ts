// Public surface of the example module. Other modules import from THIS file
// only — deep imports into example/* are a boundary violation (ADR-003).
export { ExampleModule } from './example.module';
export { GreetingService } from './application/greeting.service';
