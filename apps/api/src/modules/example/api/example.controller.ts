import { Controller, Get } from '@nestjs/common';
import type { BilingualText } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { GreetingService } from '../application/greeting.service';

@Controller('example')
export class ExampleController {
  constructor(private readonly greetingService: GreetingService) {}

  @RequirePermission('example.read')
  @Get('greeting')
  greeting(): { greeting: BilingualText } {
    return { greeting: this.greetingService.greeting() };
  }
}
