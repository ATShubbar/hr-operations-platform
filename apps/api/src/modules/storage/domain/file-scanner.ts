// Pluggable virus-scan contract (DOC-04; architecture.md Storage: "virus
// scanning"). Owned by Storage since THREAD-02 — every module that accepts an
// uploaded blob (documents, request attachments) scans it the same way. The scan
// runs on confirm, BETWEEN upload and `available`: a clean blob becomes
// available, an infected one is removed and quarantined. The interface is the
// seam — the dev pass-through here flags the EICAR test signature; a real ClamAV
// scanner swaps in behind the same token (infra).

export interface ScanResult {
  clean: boolean;
  signature?: string;
}

export interface FileScanner {
  scan(bytes: Buffer): Promise<ScanResult>;
}

// DI token — the module binds a concrete scanner to it; consumers inject the
// interface, never a specific implementation.
export const FILE_SCANNER = Symbol('FILE_SCANNER');

// The EICAR anti-malware test string — the industry-standard, harmless payload
// every scanner is required to detect. Uploading it exercises the quarantine
// path without a real virus.
export const EICAR_TEST_SIGNATURE =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
