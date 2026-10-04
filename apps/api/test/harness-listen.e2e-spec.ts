import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// HARNESS-01: every e2e app must LISTEN ON LOOPBACK for its lifetime —
// `await app.listen(0, '127.0.0.1')`, never `await app.init()`.
//
// With `app.init()` the server is not listening, so supertest binds it on port 0
// with NO host (the IPv6 wildcard) for every single request. macOS lets that
// bind succeed even while ANOTHER program holds 127.0.0.1 on the same port (a
// loopback-only tunnel or forward), and supertest then connects to
// 127.0.0.1:<port> — which the OS routes to the more specific listener: the
// other program. Measured: a test client received "SSH-2.0-OpenSSH_9.6p1
// Ubuntu…" (an SSH server's banner) as its HTTP response. That one mechanism
// produced every "flaky" symptom on record: Parse Error, a 404 from a server
// without the route, and a 200 to an UNAUTHENTICATED probe (REP-04) — i.e. it
// could make a security test pass or fail by accident.
//
// Bound to 127.0.0.1 explicitly, the OS cannot hand out a port another process
// holds there, and supertest reuses the one listener instead of re-binding.

const root = join(__dirname);

function specs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return specs(path);
    return name.endsWith('.e2e-spec.ts') ? [path] : [];
  });
}

describe('e2e apps listen on loopback (HARNESS-01)', () => {
  it('no spec starts its app with app.init()', () => {
    const offenders = specs(root)
      .filter((file) => !file.endsWith('harness-listen.e2e-spec.ts'))
      .filter((file) => /\.init\(\)/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));
    expect(offenders).toEqual([]);
  });

  it('every spec that creates an app binds it to 127.0.0.1', () => {
    const unbound = specs(root)
      .filter((file) => {
        const src = readFileSync(file, 'utf8');
        return /createNestApplication\(/.test(src) && !/\.listen\(0, '127\.0\.0\.1'\)/.test(src);
      })
      .map((file) => relative(root, file));
    expect(unbound).toEqual([]);
  });
});
