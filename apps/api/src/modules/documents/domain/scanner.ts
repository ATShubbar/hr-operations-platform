// Pluggable virus-scan contract (DOC-04; architecture.md Storage: "virus
// scanning"). The scan runs on confirm, BETWEEN upload and `available`: a clean
// blob becomes available, an infected one is removed and quarantined. The
// interface is the seam — the dev pass-through here flags the EICAR test
// signature; a real ClamAV scanner swaps in behind the same token (infra).

export interface ScanResult {
  clean: boolean;
  signature?: string;
}

export interface DocumentScanner {
  scan(bytes: Buffer): Promise<ScanResult>;
}

// DI token — the module binds a concrete scanner to it; consumers inject the
// interface, never a specific implementation.
export const DOCUMENT_SCANNER = Symbol('DOCUMENT_SCANNER');

// The EICAR anti-malware test string — the industry-standard, harmless payload
// every scanner is required to detect. Uploading it exercises the quarantine
// path without a real virus.
export const EICAR_TEST_SIGNATURE =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
