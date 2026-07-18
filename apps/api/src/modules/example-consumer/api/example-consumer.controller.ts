import { Controller, Get } from '@nestjs/common';
import type { BilingualText } from '@hr/contracts';
import { GreetingService } from '../../example/application/greeting.service';

@Controller('example-consumer')
export class ExampleConsumerController {
  constructor(private readonly greetingService: GreetingService) {}

  @Get('relay')
  relay(): { relayedFrom: string; greeting: BilingualText } {
    return { relayedFrom: 'example', greeting: this.greetingService.greeting() };
  }
}
