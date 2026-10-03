import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_TRANSPORT, type EmailMessage, type EmailTransport } from '../domain/email';

// Transactional account email (SS-06a) — invitations and password resets. Not a
// notification: there is no in-app record, no category, no preference to honour
// (a person cannot opt out of the link that lets them sign in). It exists so
// account mail leaves through the SAME transport seam as notification mail — the
// dev capture now, SMTP over the KSA-local relay in production — rather than a
// second mailer appearing somewhere else.
@Injectable()
export class AccountEmailService {
  constructor(@Inject(EMAIL_TRANSPORT) private readonly email: EmailTransport) {}

  send(message: EmailMessage): Promise<void> {
    return this.email.send(message);
  }
}
