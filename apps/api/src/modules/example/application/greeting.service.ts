import { Injectable } from '@nestjs/common';
import type { BilingualText } from '@hr/contracts';

@Injectable()
export class GreetingService {
  greeting(): BilingualText {
    return {
      ar: 'مرحباً بكم في منصة عمليات الموارد البشرية',
      en: 'Welcome to the HR Operations Platform',
    };
  }
}
