import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CLIENT_A,
  CLIENT_B,
  makeClientBase,
  makeOwnerClient,
  makeStaffClient,
  scoped,
} from '../src/clients.js';

const owner = makeOwnerClient();

beforeAll(async () => {
  await owner.spEmployee.deleteMany();
  await owner.spEmployee.createMany({
    data: [
      ...Array.from({ length: 20 }, (_, i) => ({
        clientId: CLIENT_A,
        name: `A-${i}`,
        salary: 1000 + i,
      })),
      ...Array.from({ length: 20 }, (_, i) => ({
        clientId: CLIENT_B,
        name: `B-${i}`,
        salary: 2000 + i,
      })),
    ],
  });
});

afterAll(async () => {
  await owner.$disconnect();
});

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

describe('SPIKE-001 soak + benchmark', () => {
  it('S3 soak: 3 rounds x 1000 concurrent mixed-client requests, zero bleed', async () => {
    const base = makeClientBase(10);
    const asA = scoped(base, CLIENT_A);
    const asB = scoped(base, CLIENT_B);
    try {
      for (let round = 1; round <= 3; round++) {
        let checked = 0;
        const CONCURRENCY = 50;
        for (let batch = 0; batch < 1000 / CONCURRENCY; batch++) {
          const tasks = Array.from({ length: CONCURRENCY }, (_, i) => {
            const useA = (batch * CONCURRENCY + i) % 2 === 0;
            const client = useA ? asA : asB;
            const expected = useA ? CLIENT_A : CLIENT_B;
            return client.spEmployee.findMany().then((rows) => {
              expect(rows).toHaveLength(20);
              for (const r of rows) {
                if (r.clientId !== expected) {
                  throw new Error(
                    `CROSS-CLIENT BLEED: expected ${expected}, got row of ${r.clientId}`,
                  );
                }
              }
              return rows.length;
            });
          });
          const counts = await Promise.all(tasks);
          checked += counts.reduce((a, b) => a + b, 0);
        }
        // eslint-disable-next-line no-console
        console.log(`soak round ${round}: 1000 requests, ${checked} rows checked, 0 bleed`);
      }
    } finally {
      await base.$disconnect();
    }
  });

  it('S4 benchmark: p95 overhead of scoped (tx-wrapped) vs staff baseline', async () => {
    const staff = makeStaffClient(10);
    const base = makeClientBase(10);
    const asA = scoped(base, CLIENT_A);
    const N = 300;
    try {
      // warmup
      await staff.spEmployee.findMany();
      await asA.spEmployee.findMany();

      const baseline: number[] = [];
      for (let i = 0; i < N; i++) {
        const t = performance.now();
        await staff.spEmployee.findMany({ where: { clientId: CLIENT_A } });
        baseline.push(performance.now() - t);
      }

      const scopedTimes: number[] = [];
      for (let i = 0; i < N; i++) {
        const t = performance.now();
        await asA.spEmployee.findMany();
        scopedTimes.push(performance.now() - t);
      }

      baseline.sort((a, b) => a - b);
      scopedTimes.sort((a, b) => a - b);
      const stats = (xs: number[]) => ({
        p50: percentile(xs, 50),
        p95: percentile(xs, 95),
        mean: xs.reduce((a, b) => a + b, 0) / xs.length,
      });
      const b = stats(baseline);
      const s = stats(scopedTimes);
      const overheadP95Ms = s.p95 - b.p95;
      const overheadP95Pct = ((s.p95 - b.p95) / b.p95) * 100;
      // eslint-disable-next-line no-console
      console.log(
        `S4 baseline: p50=${b.p50.toFixed(2)}ms p95=${b.p95.toFixed(2)}ms mean=${b.mean.toFixed(2)}ms\n` +
          `S4 scoped:   p50=${s.p50.toFixed(2)}ms p95=${s.p95.toFixed(2)}ms mean=${s.mean.toFixed(2)}ms\n` +
          `S4 overhead: p95 +${overheadP95Ms.toFixed(2)}ms (+${overheadP95Pct.toFixed(1)}%)`,
      );
      // S4: <= 15% p95 overhead OR <= 5ms absolute
      expect(overheadP95Pct <= 15 || overheadP95Ms <= 5).toBe(true);
    } finally {
      await staff.$disconnect();
      await base.$disconnect();
    }
  });
});
