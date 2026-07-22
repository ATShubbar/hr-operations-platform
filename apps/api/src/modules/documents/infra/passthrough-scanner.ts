import { Injectable } from '@nestjs/common';
import { DOCUMENT_SCANNER, EICAR_TEST_SIGNATURE, type DocumentScanner, type ScanResult } from '../domain/scanner';

// Dev/interim scanner (DOC-04). NOT a real antivirus — it passes everything as
// clean EXCEPT the EICAR test signature, so the quarantine path is exercisable
// in dev and CI without ClamAV. Production binds a real ClamAV-backed scanner to
// DOCUMENT_SCANNER instead; nothing else changes.
@Injectable()
export class PassThroughScanner implements DocumentScanner {
  async scan(bytes: Buffer): Promise<ScanResult> {
    return bytes.includes(EICAR_TEST_SIGNATURE)
      ? { clean: false, signature: 'EICAR-Test-File' }
      : { clean: true };
  }
}

// Provider binding — swap useClass for the real scanner in production.
export const passThroughScannerProvider = {
  provide: DOCUMENT_SCANNER,
  useClass: PassThroughScanner,
};
