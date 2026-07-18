import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { ExampleModule } from './modules/example/public-api';
import { ExampleConsumerModule } from './modules/example-consumer/public-api';

@Module({
  imports: [HealthModule, ExampleModule, ExampleConsumerModule],
})
export class AppModule {}
