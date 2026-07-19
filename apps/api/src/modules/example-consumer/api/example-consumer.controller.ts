import { Controller, Get } from '@nestjs/common';
import type { BilingualText } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { GreetingService } from '../../example/public-api';

@Controller('example-consumer')
export class ExampleConsumerController {
  constructor(private readonly greetingService: GreetingService) {}

  @RequirePermission('example.read')
  @Get('relay')
  relay(): { relayedFrom: string; greeting: BilingualText } {
    return { relayedFrom: 'example', greeting: this.greetingService.greeting() };
  }
}
