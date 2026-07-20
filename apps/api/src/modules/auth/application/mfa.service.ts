import { Injectable } from '@nestjs/common';
import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';

// TOTP per ADR-002, on otplib v13's functional API. epochTolerance of ±30s
// (one time step each way) absorbs modest clock skew.
const EPOCH_TOLERANCE_SECONDS = 30;
const ISSUER = 'HR Operations Platform';

@Injectable()
export class MfaService {
  generateSecret(): string {
    return generateSecret();
  }

  provisioningUri(email: string, secret: string): string {
    return generateURI({ issuer: ISSUER, label: email, secret });
  }

  verify(code: string, secret: string): boolean {
    try {
      return verifySync({
        token: code,
        secret,
        epochTolerance: EPOCH_TOLERANCE_SECONDS,
      }).valid;
    } catch {
      return false;
    }
  }

  // Test support: e2e drives the enroll/challenge cycle with REAL codes.
  generateCode(secret: string): string {
    return generateSync({ secret });
  }
}
