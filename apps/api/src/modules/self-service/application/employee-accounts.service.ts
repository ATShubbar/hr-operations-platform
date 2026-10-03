import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { EmployeeAccountResponse } from '@hr/contracts';
import type { AuthUserModel as AuthUser } from '../../../generated/prisma/models';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/public-api';
import {
  AccountTokensService,
  INVITE_TTL_SECONDS,
  PasswordService,
  RESET_TTL_SECONDS,
  SessionsService,
  UsersService,
} from '../../auth/public-api';
import { ClientsService } from '../../clients/public-api';
import { ConfigService } from '../../configuration/public-api';
import { EmployeesService } from '../../employees/public-api';
import { AccountEmailService } from '../../notifications/public-api';
import { inviteEmail, resetEmail } from '../domain/account-email';

const EMPLOYEE_SELF_SERVICE_FLAG = 'flag.employee-self-service';
const RESETS_PER_HOUR = 3;

// Employee self-service ACCOUNTS (SS-06a, ADR-011). Orchestrated here, at the top
// of the module graph: Employees says whether the person may have an account,
// Configuration whether their employer opted in, Auth owns the account and its
// tokens and sessions, Notifications carries the mail. Nothing imports this
// module, so none of those dependencies can form a cycle — and Auth never has
// to subscribe to a domain event.
@Injectable()
export class EmployeeAccountsService {
  private readonly logger = new Logger(EmployeeAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: AccountTokensService,
    private readonly sessions: SessionsService,
    private readonly employees: EmployeesService,
    private readonly clients: ClientsService,
    private readonly config: ConfigService,
    private readonly mail: AccountEmailService,
  ) {}

  async get(employeeId: string): Promise<EmployeeAccountResponse> {
    const account = await this.users.findByEmployeeId(employeeId);
    if (!account) throw new NotFoundException('No account for this employee');
    return toResponse(account);
  }

  /**
   * Invite an employee — or re-invite one whose invitation is still pending
   * (the older link stops working). Refused for a terminated record, a company
   * that has not opted in, an account that is already active or disabled, or an
   * address another account uses. Account + token + audit commit together; the
   * email goes after the commit, and a failed send leaves the invitation valid.
   */
  async invite(employeeId: string, email: string): Promise<EmployeeAccountResponse> {
    const employee = await this.employees.getById(employeeId);
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.employmentStatus === 'terminated') {
      throw new ConflictException('A terminated employee cannot be invited');
    }
    if (
      !(await this.config.isEnabled(EMPLOYEE_SELF_SERVICE_FLAG, { clientId: employee.clientId }))
    ) {
      throw new ConflictException('Employee self-service is not enabled for this company');
    }

    const existing = await this.users.findByEmployeeId(employeeId);
    if (existing && existing.status !== 'invited') {
      throw new ConflictException(
        existing.status === 'active'
          ? 'This employee already has an active account'
          : 'This employee’s account is disabled — reactivate it instead',
      );
    }
    const owner = await this.users.findByEmail(email);
    if (owner && owner.id !== existing?.id) throw new ConflictException('Email already in use');

    const unusable = await this.passwords.hash(randomBytes(32).toString('base64url'));
    const { account, token } = await this.prisma.$transaction(async (tx) => {
      const account = existing
        ? existing.email === email.toLowerCase()
          ? existing
          : await this.users.updateEmail(existing.id, email, tx)
        : await this.users.createInvitedEmployeeUser(
            { email, employeeId, unusablePasswordHash: unusable },
            tx,
          );
      const token = await this.tokens.issue(account.id, 'invite', INVITE_TTL_SECONDS, tx);
      await this.audit.record(tx, {
        resource: 'employee-user',
        action: 'invite',
        clientId: employee.clientId,
        // The address and the record — never the token.
        after: { employeeId, email: account.email, status: account.status },
      });
      return { account, token };
    });

    const client = await this.clients.getById(employee.clientId);
    const lang =
      (await this.config.getAllForClient(employee.clientId))['ui.language'] === 'en' ? 'en' : 'ar';
    const companyName = (lang === 'ar' ? client?.nameAr : client?.nameEn) ?? '';
    let emailSent = true;
    try {
      await this.mail.send(inviteEmail(account.email, lang, token, companyName));
    } catch (err) {
      emailSent = false;
      this.logger.warn(`invite email failed for employee ${employeeId}: ${(err as Error).message}`);
    }
    return { ...toResponse(account), emailSent };
  }

  /**
   * Deactivate or reactivate. Deactivating disables the account, cancels its
   * links and ends EVERY session at once. Reactivating returns it to `active`
   * if a password was ever set, otherwise to `invited` (staff then re-invite).
   */
  async setStatus(
    employeeId: string,
    status: 'active' | 'disabled',
  ): Promise<EmployeeAccountResponse> {
    const account = await this.users.findByEmployeeId(employeeId);
    if (!account) throw new NotFoundException('No account for this employee');
    const employee = await this.employees.getById(employeeId);
    if (status === 'active' && employee?.employmentStatus === 'terminated') {
      throw new ConflictException('A terminated employee’s account cannot be reactivated');
    }
    const target =
      status === 'disabled' ? 'disabled' : account.passwordSetAt ? 'active' : 'invited';
    const row = await this.close(account, target, employee?.clientId ?? null, 'update');
    return toResponse(row);
  }

  /** EmployeeTerminated → close the account (if any). Idempotent. */
  async closeForTerminated(employeeId: string, clientId: string): Promise<void> {
    const account = await this.users.findByEmployeeId(employeeId);
    if (!account) return;
    await this.close(account, 'disabled', clientId, 'deactivate-on-termination');
  }

  /**
   * "Forgot password" — employee accounts only (staff are reset by an admin,
   * which keeps this path away from admin accounts). The caller learns NOTHING:
   * unknown address, a non-employee, an invited or disabled account and the
   * throttle all look exactly like success.
   */
  async requestReset(email: string): Promise<void> {
    const account = await this.users.findByEmail(email);
    if (!account || account.principalType !== 'employee' || account.status !== 'active') return;
    const since = new Date(Date.now() - 60 * 60 * 1000);
    if ((await this.tokens.countIssuedSince(account.id, 'reset', since)) >= RESETS_PER_HOUR) return;
    const token = await this.tokens.issue(account.id, 'reset', RESET_TTL_SECONDS);
    const lang = await this.config.resolveLanguageForUser(account.id);
    try {
      await this.mail.send(resetEmail(account.email, lang, token));
    } catch (err) {
      this.logger.warn(`reset email failed for account ${account.id}: ${(err as Error).message}`);
    }
  }

  // Status change + cancelled links + audit in one transaction, then every
  // session ends. Sessions live in Redis, outside the transaction, so they are
  // cut only AFTER the change has committed — never for a change that rolled back.
  private async close(
    account: AuthUser,
    status: 'active' | 'disabled' | 'invited',
    clientId: string | null,
    action: string,
  ): Promise<AuthUser> {
    const row = await this.prisma.$transaction(async (tx) => {
      const row =
        account.status === status ? account : await this.users.setStatus(account.id, status, tx);
      if (status === 'disabled') await this.tokens.revokeAll(account.id, tx);
      if (account.status !== status) {
        await this.audit.record(tx, {
          resource: 'employee-user',
          action,
          clientId,
          before: { status: account.status },
          after: { status: row.status },
        });
      }
      return row;
    });
    if (status === 'disabled') await this.sessions.destroyAllForUser(account.id);
    return row;
  }
}

function toResponse(a: AuthUser): EmployeeAccountResponse {
  return {
    employeeId: a.employeeId ?? '',
    email: a.email,
    status: a.status,
    passwordSet: a.passwordSetAt !== null,
  };
}
