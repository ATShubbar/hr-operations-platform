import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { requestContext } from '../../../context/request-context';
import { UsersService } from '../../auth/public-api';
import { DocumentsService } from '../../documents/public-api';
import { EventBus } from '../../events/public-api';
import { DocumentExpiringEvent } from '../domain/document-expiring.event';
import { rolesForCategory } from '../domain/recipients';
import { daysUntil, scanHorizon, tierFor } from '../domain/thresholds';

export interface ExpiryScanResult {
  scanned: number; // documents within the scan horizon
  alertsRaised: number; // (document, tier) claims newly created this scan
  notificationsSent: number; // recipients the published events reached
}

// The document-expiry engine (EXP-01; ACTION-PLAN 3.4) — the first real cross-
// module consumer. Reads documents through DocumentsService (never doc_documents
// directly) and PUBLISHES a DocumentExpiring fact per newly-claimed (document,
// tier) — it owns "what expires" and "which staff manage it"; Notifications
// subscribes and owns "how people are told" (NOTIF-05, ADR-004). This module no
// longer depends on Notifications. exp_alerts is its OWN idempotency ledger, so a
// DAILY scan is safe: each (document, tier) fires at most once, ever.
@Injectable()
export class ExpiryScanService {
  private readonly logger = new Logger(ExpiryScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly users: UsersService,
    private readonly events: EventBus,
  ) {}

  async scan(asOf: Date): Promise<ExpiryScanResult> {
    const docs = await this.documents.expiringOnOrBefore(scanHorizon(asOf));
    const correlationId = requestContext.get()?.requestId ?? null;
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
      // crash between the claim and publish drops that one alert, which we prefer
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

      // Resolve the audience (this module owns the category→staff-role policy) and
      // publish the fact. Notifications subscribes and renders/delivers.
      const recipients = await this.users.findStaffByRoles(rolesForCategory(doc.category));
      const recipientUserIds = recipients.map((r) => r.id);
      await this.events.publish(
        new DocumentExpiringEvent(
          doc.id,
          doc.clientId,
          doc.category,
          doc.title,
          doc.expiryDate.toISOString().slice(0, 10),
          tier,
          days,
          recipientUserIds,
          correlationId,
        ),
      );
      notificationsSent += recipientUserIds.length;
    }

    this.logger.log(
      `expiry scan @ ${asOf.toISOString().slice(0, 10)}: ${docs.length} in window, ` +
        `${alertsRaised} tiers raised, ${notificationsSent} notifications`,
    );
    return { scanned: docs.length, alertsRaised, notificationsSent };
  }
}
