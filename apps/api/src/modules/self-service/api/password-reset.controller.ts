import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { passwordResetRequestSchema } from '@hr/contracts';
import { Public } from '../../../auth/permissions.decorator';
import { EmployeeAccountsService } from '../application/employee-accounts.service';

// "Forgot password" for employee accounts (SS-06a). @Public — the person cannot
// sign in, which is the point. ALWAYS 202 with an empty body, whatever was sent:
// a malformed address, an unknown one, a staff account, a disabled account and
// the throttle all answer exactly like a real reset, so the endpoint cannot be
// used to find out who has an account.
@Controller('me')
export class PasswordResetController {
  constructor(private readonly accounts: EmployeeAccountsService) {}

  @Public()
  @Post('password-reset')
  @HttpCode(202)
  async request(@Body() body: unknown): Promise<Record<string, never>> {
    const parsed = passwordResetRequestSchema.safeParse(body);
    if (parsed.success) await this.accounts.requestReset(parsed.data.email);
    return {};
  }
}
