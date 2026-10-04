import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { SeedStorageConfig } from './seed-guard';

// SEED-01: the files behind the seed's documents and sample attachments. Each is
// a small, VALID one-page PDF that says plainly what it is — "Sample data — not a
// real document" — written through the same S3-compatible API the app uses
// (ADR-010 clause 3; MinIO locally, Google Cloud Storage's interop API on UAT).

/** A one-page PDF (Helvetica, 12pt) with these lines. Non-ASCII is replaced. */
export function buildSamplePdf(lines: readonly string[]): Buffer {
  const ascii = (s: string) =>
    s
      .replace(/[—–]/g, '-')
      .replace(/[^\x20-\x7e]/g, '?')
      .replace(/([\\()])/g, '\\$1');
  const text = lines
    .map((l, i) => `BT /F1 ${i === 0 ? 16 : 12} Tf 72 ${740 - i * 26} Td (${ascii(l)}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text, 'latin1')} >>\nstream\n${text}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Writes and removes seed files in the configured bucket (creating it locally if absent). */
export class SeedFiles {
  private readonly client: S3Client;
  private ready?: Promise<void>;

  constructor(private readonly config: SeedStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType = 'application/pdf'): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  close(): void {
    this.client.destroy();
  }

  // Same rule as the app's StorageService: look first, create only when missing
  // (local MinIO starts empty; on UAT the bucket exists and is never created here).
  private ensureBucket(): Promise<void> {
    this.ready ??= (async () => {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
      }
    })();
    return this.ready;
  }
}
