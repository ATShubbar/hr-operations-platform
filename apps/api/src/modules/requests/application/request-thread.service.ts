import { ForbiddenException, Injectable } from '@nestjs/common';
import type { RequestComment } from '@hr/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmployeeScopedPrismaService } from '../../../prisma/employee-scoped-prisma.service';
import { ScopedPrismaService } from '../../../prisma/scoped-prisma.service';
import { requestContext } from '../../../context/request-context';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  RequestCommentModel as CommentRecord,
  RequestModel as RequestRecord,
} from '../../../generated/prisma/models';
import { AuditService } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';
import { EventBus } from '../../events/public-api';
import { RequestCommentAddedEvent } from '../domain/request-comment-added.event';

type Tx = Prisma.TransactionClient;
type Reads = Pick<Tx, 'request' | 'requestComment'>;

// A request's thread (ADR-016). THREAD-01: comments — on the SAME three fenced
// paths as requests (staff cross-client; client manager own company via RLS;
// employee own raised requests via RLS). A request the caller cannot see is
// null (→ 404) on every path, before any comment is read or written. Every
// comment is audited (resource 'request-comment') in the same transaction, and
// after the commit a RequestCommentAdded fact tells Notifications.
@Injectable()
export class RequestThreadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoped: ScopedPrismaService,
    private readonly employeeDb: EmployeeScopedPrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly events: EventBus,
  ) {}

  // ---- reads ---------------------------------------------------------------

  listForStaff(requestId: string): Promise<RequestComment[] | null> {
    return this.list(this.prisma, requestId);
  }

  listForClient(clientId: string, requestId: string): Promise<RequestComment[] | null> {
    return this.scoped.transaction(clientId, (tx) => this.list(tx, requestId));
  }

  listForEmployee(employeeId: string, requestId: string): Promise<RequestComment[] | null> {
    return this.employeeDb.transaction(employeeId, (tx) => this.list(tx, requestId));
  }

  // ---- writes --------------------------------------------------------------

  addForStaff(requestId: string, body: string): Promise<RequestComment | null> {
    return this.add(requestId, body, (fn) => this.prisma.$transaction(fn), true);
  }

  addForClient(clientId: string, requestId: string, body: string): Promise<RequestComment | null> {
    return this.add(requestId, body, (fn) => this.scoped.transaction(clientId, fn), false);
  }

  addForEmployee(employeeId: string, requestId: string, body: string): Promise<RequestComment | null> {
    return this.add(requestId, body, (fn) => this.employeeDb.transaction(employeeId, fn), false);
  }

  // ---- shared ---------------------------------------------------------------

  private async list(db: Reads, requestId: string): Promise<RequestComment[] | null> {
    const request = await db.request.findUnique({ where: { id: requestId } });
    if (!request) return null;
    const rows = await db.requestComment.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });
    return this.present(rows);
  }

  private async add(
    requestId: string,
    body: string,
    run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>,
    byStaff: boolean,
  ): Promise<RequestComment | null> {
    const actor = requestContext.get()?.actorId;
    if (!actor) throw new ForbiddenException('No signed-in user');
    const done = await run(async (tx) => {
      // The request as THIS path sees it — invisible is null (→ 404).
      const request = await tx.request.findUnique({ where: { id: requestId } });
      if (!request) return null;
      const row = await tx.requestComment.create({
        data: {
          requestId,
          clientId: request.clientId,
          requesterEmployeeId: request.requesterEmployeeId,
          authorUserId: actor,
          body: body.trim(),
        },
      });
      await this.audit.record(tx, {
        resource: 'request-comment',
        resourceId: row.id,
        action: 'create',
        clientId: request.clientId,
        after: { requestId, length: row.body.length },
      });
      return { request, row };
    });
    if (!done) return null;
    await this.publish(done.request, done.row, byStaff);
    return (await this.present([done.row]))[0]!;
  }

  private async publish(request: RequestRecord, row: CommentRecord, byStaff: boolean): Promise<void> {
    await this.events.publish(
      new RequestCommentAddedEvent(
        request.id,
        request.clientId,
        request.title,
        row.authorUserId,
        byStaff,
        request.createdByUserId,
        request.assigneeUserId,
        requestContext.get()?.requestId ?? null,
      ),
    );
  }

  private async present(rows: CommentRecord[]): Promise<RequestComment[]> {
    const who = await this.users.principals(rows.map((r) => r.authorUserId));
    const me = requestContext.get()?.actorId ?? null;
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      author: who.get(r.authorUserId) ?? null,
      mine: r.authorUserId === me,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
