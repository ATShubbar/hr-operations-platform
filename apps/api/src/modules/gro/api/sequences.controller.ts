import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  fileSequenceStepSchema,
  startSequenceSchema,
  type SequenceListResponse,
  type SequenceResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import { UsersService } from '../../auth/public-api';
import { EmployeesService } from '../../employees/public-api';
import { SequencesService, type SequenceView } from '../application/sequences.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Onboarding and final-exit sequences API (MOB-02, ADR-018). STAFF ONLY: gro.read
// to read, gro.process to start / file / reopen / cancel. Client managers HOLD
// gro.read (for the status-only procedure view), so every route here also asks
// scopeOf for the staff path — the permission alone would let them read their
// own people's sequences, which the owner ruled out (staff only). Employees are
// refused by scopeOf too.
//
// The response is a WHITELIST: steps travel as keys (the web translates them),
// `waitingOn` as keys, people as names, never user ids.
@Controller()
export class SequencesController {
  constructor(
    private readonly sequences: SequencesService,
    private readonly employees: EmployeesService,
    private readonly users: UsersService,
  ) {}

  @RequirePermission('gro.read')
  @Get('employees/:id/sequences')
  async list(@Param('id') employeeId: string): Promise<SequenceListResponse> {
    this.staffOnly();
    await this.requireEmployee(employeeId);
    return { sequences: await this.present(await this.sequences.listForEmployee(employeeId)) };
  }

  @RequirePermission('gro.process')
  @Post('employees/:id/sequences')
  @HttpCode(201)
  async start(@Param('id') employeeId: string, @Body() body: unknown): Promise<SequenceResponse> {
    this.staffOnly();
    if (!UUID_RE.test(employeeId)) throw new NotFoundException('Employee not found');
    const parsed = startSequenceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid sequence');
    return this.one(await this.sequences.start(employeeId, parsed.data.kind));
  }

  @RequirePermission('gro.process')
  @Post('gro-sequences/:id/steps/:key/file')
  @HttpCode(200)
  async file(
    @Param('id') id: string,
    @Param('key') key: string,
    @Body() body: unknown,
  ): Promise<SequenceResponse> {
    this.staffOnly();
    this.requireId(id);
    const parsed = fileSequenceStepSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Invalid filing');
    return this.one(await this.sequences.file(id, key, parsed.data.filedOn));
  }

  @RequirePermission('gro.process')
  @Post('gro-sequences/:id/steps/:key/reopen')
  @HttpCode(200)
  async reopen(@Param('id') id: string, @Param('key') key: string): Promise<SequenceResponse> {
    this.staffOnly();
    this.requireId(id);
    return this.one(await this.sequences.reopen(id, key));
  }

  @RequirePermission('gro.process')
  @Post('gro-sequences/:id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string): Promise<SequenceResponse> {
    this.staffOnly();
    this.requireId(id);
    return this.one(await this.sequences.cancel(id));
  }

  // ---- helpers ----

  private staffOnly(): void {
    if (scopeOf(requestContext.get()).kind !== 'staff') {
      throw new ForbiddenException('Sequences are for staff');
    }
  }

  private async requireEmployee(employeeId: string): Promise<void> {
    if (!UUID_RE.test(employeeId) || !(await this.employees.getById(employeeId))) {
      throw new NotFoundException('Employee not found');
    }
  }

  private requireId(id: string): void {
    if (!UUID_RE.test(id)) throw new NotFoundException('Sequence not found');
  }

  private async one(view: SequenceView): Promise<SequenceResponse> {
    return (await this.present([view]))[0]!;
  }

  private async present(views: SequenceView[]): Promise<SequenceResponse[]> {
    const ids = views.flatMap((v) => [v.startedByUserId, ...v.steps.map((s) => s.filedByUserId)]);
    const names = await this.users.displayNames(ids.filter((x): x is string => !!x));
    const person = (userId: string | null) => (userId ? { name: names.get(userId) ?? null } : null);
    return views.map((v) => ({
      id: v.id,
      employeeId: v.employeeId,
      kind: v.kind,
      status: v.status,
      startedOn: v.startedOn,
      startedBy: person(v.startedByUserId),
      completedAt: v.completedAt?.toISOString() ?? null,
      cancelledAt: v.cancelledAt?.toISOString() ?? null,
      steps: v.steps.map((s) => ({
        key: s.key,
        portal: s.portal,
        fee: s.fee,
        day: s.day,
        target: s.target,
        state: s.state,
        needs: [...s.needs],
        // Keys, not the engine's English titles — the web translates them.
        waitingOn:
          s.state === 'blocked'
            ? s.needs.filter((k) => v.steps.find((x) => x.key === k)?.state !== 'filed')
            : [],
        filedOn: s.filedOn,
        filedBy: s.filedOn ? person(s.filedByUserId) : null,
      })),
    }));
  }
}
