// What the first bytes of a file say it is (THREAD-02; moved to Storage in
// BILL-02 so a fee's receipt is checked by the same code). The upload declares a
// content type, but the browser PUTs whatever it likes — so confirm compares
// the declared type with the file's own signature ("magic number") and refuses
// a mismatch. Only PDF, JPG and PNG are known here — the types uploads accept.
const SIGNATURES: Record<string, readonly number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
};

export function matchesSignature(contentType: string, bytes: Buffer): boolean {
  const sig = SIGNATURES[contentType];
  return !!sig && bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);
}
