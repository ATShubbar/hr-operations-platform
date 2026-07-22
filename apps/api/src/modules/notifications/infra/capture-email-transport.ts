import { Injectable, Logger } from '@nestjs/common';
import { EMAIL_TRANSPORT, type EmailMessage, type EmailTransport } from '../domain/email';

// Dev/interim email transport (NOTIF-03). NOT a real mailer — it records every
// sent message in memory (and logs it), so notification delivery is inspectable
// in dev and CI without SMTP. Production binds a real transport (nodemailer over
// the KSA-local SMTP relay) to EMAIL_TRANSPORT instead; nothing else changes.
@Injectable()
export class CaptureEmailTransport implements EmailTransport {
  private readonly logger = new Logger(CaptureEmailTransport.name);
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    this.logger.log(`email → ${message.to}: ${message.subject}`);
  }

  // Test helper: the messages captured for a given recipient.
  forRecipient(to: string): EmailMessage[] {
    return this.sent.filter((m) => m.to === to);
  }
}

// Provider binding — swap useClass for the SMTP transport in production.
export const captureEmailTransportProvider = {
  provide: EMAIL_TRANSPORT,
  useClass: CaptureEmailTransport,
};
