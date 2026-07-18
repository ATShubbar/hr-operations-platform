import { Module } from '@nestjs/common';
import { ExampleModule } from '../example/public-api';
import { ExampleConsumerController } from './api/example-consumer.controller';

@Module({
  imports: [ExampleModule],
  controllers: [ExampleConsumerController],
})
export class ExampleConsumerModule {}
