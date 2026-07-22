import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/modules/storage/public-api';

// STOR-01: the S3-compatible storage adapter, proven end-to-end against MinIO
// (docker compose). The whole point is the PRESIGNED round-trip — the API signs
// URLs, the client transfers bytes directly to/from the object store.

describe('Storage adapter — presigned round-trip against MinIO (STOR-01, e2e)', () => {
  let app: INestApplication;
  let storage: StorageService;
  const clientId = '11111111-1111-4111-8111-111111111111';
  const key = 'roundtrip.txt';
  const body = Buffer.from('STOR-01 round-trip payload — الوثيقة');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    storage = app.get(StorageService);
  });

  afterAll(async () => {
    await storage.deleteObject(storage.keyFor(clientId, key)).catch(() => {});
    await app.close();
  });

  it('keys are per-client prefixed', () => {
    expect(storage.keyFor(clientId, 'a', 'b.pdf')).toBe(`clients/${clientId}/a/b.pdf`);
  });

  it('presigned PUT uploads, presigned GET downloads the same bytes', async () => {
    const objectKey = storage.keyFor(clientId, key);

    const uploadUrl = await storage.presignUpload(objectKey, 'text/plain');
    expect(uploadUrl).toContain('X-Amz-Signature'); // a genuine SigV4 presigned URL
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    expect(put.status).toBe(200);

    const downloadUrl = await storage.presignDownload(objectKey);
    const got = await fetch(downloadUrl);
    expect(got.status).toBe(200);
    expect(Buffer.from(await got.arrayBuffer()).equals(body)).toBe(true);
  });

  it('server-side put/get round-trips (used by the future scan hook)', async () => {
    const objectKey = storage.keyFor(clientId, 'server-side.bin');
    await storage.putObject(objectKey, body, 'application/octet-stream');
    expect((await storage.getObject(objectKey)).equals(body)).toBe(true);
    await storage.deleteObject(objectKey);
  });

  it('delete removes the object (subsequent download 404s)', async () => {
    const objectKey = storage.keyFor(clientId, key);
    await storage.deleteObject(objectKey);
    const downloadUrl = await storage.presignDownload(objectKey);
    const got = await fetch(downloadUrl);
    expect(got.status).toBe(404); // NoSuchKey
  });
});
