import { Module } from '@nestjs/common';
import { GreetingService } from './application/greeting.service';
import { ExampleController } from './api/example.controller';

@Module({
  controllers: [ExampleController],
  providers: [GreetingService],
  exports: [GreetingService],
})
export class ExampleModule {}
