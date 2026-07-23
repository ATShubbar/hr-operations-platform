import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { UsersService } from '../../auth/public-api';
import { DocumentsService } from '../../documents/public-api';
import { NotificationsService } from '../../notifications/public-api';
import { buildExpiryContent } from '../domain/messages';
import { rolesForCategory } from '../domain/recipients';
import { daysUntil, scanHorizon, tierFor } from '../domain/thresholds';

export interface ExpiryScanResult {
  scanned: number; // documents within the scan horizon
  alertsRaised: number; // (document, tier) claims newly created this scan
  notificationsSent: number; // per-recipient notify() calls
}

// The document-expiry engine (EXP-01; ACTION-PLAN 3.4) — the first real cross-
// module consumer. Reads documents through DocumentsService (never doc_documents
// directly), raises notifications through NotificationsService (the ADR-004
// event bus is NOT built yet — NOTIF-05 — so the documented fallback applies:
// producers call notify()). exp_alerts is this module's OWN idempotency ledger,
// so a DAILY scan is safe: each (document, tier) fires at most once, ever.
@Injectable()
export class ExpiryScanService {
  private readonly logger = new Logger(ExpiryScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  async scan(asOf: Date): Promise<ExpiryScanResult> {
    const docs = await this.documents.expiringOnOrBefore(scanHorizon(asOf));
    let alertsRaised = 0;
    let notificationsSent = 0;

    for (const doc of docs) {
      if (!doc.expiryDate) continue; // the query guarantees non-null; belt-and-braces
      const days = daysUntil(asOf, doc.expiryDate);
      const tier = tierFor(days);
      if (tier === null) continue; // outside every warning window

      // Claim the (document, tier) slot FIRST — the unique index is the
      // idempotency guard. A P2002 means another scan (or an earlier run today)
      // already claimed it → skip. This makes delivery at-most-once per tier: a
      // crash between the claim and notify drops that one alert, which we prefer
      // to duplicate alerts on every daily run.
      try {
        await this.prisma.expiryAlert.create({
          data: { clientId: doc.clientId, documentId: doc.id, threshold: tier },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          continue;
        }
        throw err;
      }
      alertsRaised += 1;

      const expiryIso = doc.expiryDate.toISOString().slice(0, 10);
      const content = buildExpiryContent({
        category: doc.category,
        title: doc.title,
        expiryDate: expiryIso,
        days,
      });
      const recipients = await this.users.findStaffByRoles(rolesForCategory(doc.category));
      for (const recipient of recipients) {
        await this.notifications.notify({
          recipientUserId: recipient.id,
          category: 'document_expiry',
          title: content.title,
          body: content.body,
          data: { documentId: doc.id, category: doc.category, threshold: tier, expiryDate: expiryIso },
        });
        notificationsSent += 1;
      }
    }

    this.logger.log(
      `expiry scan @ ${asOf.toISOString().slice(0, 10)}: ${docs.length} in window, ` +
        `${alertsRaised} tiers raised, ${notificationsSent} notifications`,
    );
    return { scanned: docs.length, alertsRaised, notificationsSent };
  }
}
