import { Injectable } from '@nestjs/common';
import { EICAR_TEST_SIGNATURE, FILE_SCANNER, type FileScanner, type ScanResult } from '../domain/file-scanner';

// Dev/interim scanner (DOC-04). NOT a real antivirus — it passes everything as
// clean EXCEPT the EICAR test signature, so the quarantine path is exercisable
// in dev and CI without ClamAV. Production binds a real ClamAV-backed scanner to
// FILE_SCANNER instead; nothing else changes.
@Injectable()
export class PassThroughScanner implements FileScanner {
  async scan(bytes: Buffer): Promise<ScanResult> {
    return bytes.includes(EICAR_TEST_SIGNATURE)
      ? { clean: false, signature: 'EICAR-Test-File' }
      : { clean: true };
  }
}

// Provider binding — swap useClass for the real scanner in production.
export const passThroughScannerProvider = {
  provide: FILE_SCANNER,
  useClass: PassThroughScanner,
};
