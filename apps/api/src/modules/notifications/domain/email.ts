// Pluggable email transport (NOTIF-03). The dispatch worker renders a
// notification into an EmailMessage and hands it to whatever transport is bound
// to EMAIL_TRANSPORT — a dev capture here; a real SMTP transport (nodemailer) in
// production (deferred to infra). Same seam pattern as the document scanner
// (DOC-04): consumers depend on the interface, never a concrete transport.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');
