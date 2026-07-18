import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Prisma wiring (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.ws11Check.deleteMany({ where: { note: 'ws11-e2e' } });
    await app.close();
  });

  it('writes and reads a row through the app-wired Prisma client', async () => {
    const created = await prisma.ws11Check.create({ data: { note: 'ws11-e2e' } });
    expect(created.id).toBeGreaterThan(0);

    const found = await prisma.ws11Check.findUnique({ where: { id: created.id } });
    expect(found?.note).toBe('ws11-e2e');
  });
});
