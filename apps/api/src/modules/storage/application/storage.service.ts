import { Injectable } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// S3-compatible object storage adapter (STOR-01; architecture.md Shared Modules).
// Provider-AGNOSTIC on purpose: the endpoint is configuration, so the same code
// runs against MinIO locally and the KSA-hosted object store in production
// (provider is ADR-006's open item — only STORAGE_ENDPOINT/keys change). All
// object keys are PER-CLIENT prefixed (clients/<clientId>/…) so a client's blobs
// share a namespace the way its rows share client_id.
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  // Memoized bucket-existence check: run once, before the first write.
  private bucketReady?: Promise<void>;

  constructor() {
    this.bucket = process.env.STORAGE_BUCKET ?? 'hr-documents';
    this.client = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT ?? 'http://localhost:9002',
      region: process.env.STORAGE_REGION ?? 'us-east-1',
      // MinIO (and most self-hosted S3) need path-style addressing — bucket in
      // the path, not the hostname.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY ?? 'hr_minio',
        secretAccessKey: process.env.STORAGE_SECRET_KEY ?? 'hr_minio_dev_pw',
      },
    });
  }

  // Build a per-client object key. Every document blob lives under its client's
  // prefix — the storage analogue of the client_id isolation boundary.
  keyFor(clientId: string, ...parts: string[]): string {
    return ['clients', clientId, ...parts].join('/');
  }

  // A short-lived URL the client uploads the blob TO (HTTP PUT), directly to the
  // object store — the API never proxies the bytes. The uploader must send the
  // same Content-Type it is signed with.
  async presignUpload(key: string, contentType: string, expiresInSeconds = 900): Promise<string> {
    await this.ensureBucket();
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
  }

  // A short-lived URL the client downloads the blob FROM (HTTP GET).
  async presignDownload(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  // Object metadata, or null if the object does not exist — used to CONFIRM a
  // presigned upload actually landed (and to read its real size) before marking
  // a document available (DOC-02).
  async statObject(key: string): Promise<{ size: number } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0 };
    } catch {
      return null;
    }
  }

  // Server-side put/get — used by the future virus-scan hook (DOC-04) and by
  // tests; the normal document path uses presigned URLs, not these.
  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      }
    })();
    return this.bucketReady;
  }
}
