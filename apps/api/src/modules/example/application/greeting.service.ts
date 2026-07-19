import { Injectable, Logger } from '@nestjs/common';
import type { BilingualText } from '@hr/contracts';

@Injectable()
export class GreetingService {
  private readonly logger = new Logger(GreetingService.name);

  greeting(): BilingualText {
    this.logger.log('greeting served');
    return {
      ar: 'مرحباً بكم في منصة عمليات الموارد البشرية',
      en: 'Welcome to the HR Operations Platform',
    };
  }
}
