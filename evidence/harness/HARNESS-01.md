# HARNESS-01 — Make the API suite trustworthy — Evidence

- Date: 2026-10-04
- Task card: `BACKLOG.md` → HARNESS-01
- Status: done
- Commit: `HARNESS-01: the API suite stops lying — loopback-bound test apps, BullMQ shutdown guard`
- Scope: `apps/api/test/**` (75 one-line changes + one guard spec) and **one app change** (`QueueModule`), owner-approved mid-card after stop-and-report.
- Run logs: [`HARNESS-01-runs.txt`](HARNESS-01-runs.txt) (all 30 full runs, one line each).

## Result

| | Full runs | Red | Kinds |
|---|---|---|---|
| **Before** | 10 | **3** | 3 × Redis "Connection is closed" teardown (515/515 passing) |
| After the queue guard only | 10 | **3** | 2 × `Parse Error: Expected HTTP/` (real test failures) + 1 × the same Redis teardown (a third queue the first guard missed) |
| **After both fixes** | 10 | **0** | 517/517 every run (515 + the 2 new guard tests) |

## Two separate flakes

### 1. The test HTTP client was sometimes answered by ANOTHER PROGRAM on the machine

**This is what produced REP-04's symptoms and SS-07's false fence failure.**

**Captured in the act.** A scratch diagnostic (since deleted) logged the bytes a test client received when it failed to parse a response:

```
[diag-http] HPE_INVALID_CONSTANT reusedSocket=false … path=/clients/:clientId/users/:id
            raw="SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.16\r\n"
```

That is an **SSH server's banner**. The test asked the API under test for an HTTP response and got an SSH server.

**The mechanism:**
1. Every spec started its app with `app.init()`, which does not listen.
2. On a server that isn't listening, supertest calls `listen(0)` with **no host**, which binds the IPv6 wildcard, **for every single request** (and closes it after).
3. macOS lets that bind succeed even when **another process already holds `127.0.0.1` on the same port**: a loopback-only tunnel or forward, here an Ubuntu VM or container's SSH.
4. supertest then connects to `127.0.0.1:<port>`, and the OS routes it to the **more specific listener: the other program**.

Depending on what that program is, the test sees a `Parse Error`, a **404** (another HTTP server without the route), or a **200 to an unauthenticated probe** (REP-04's `GET /documents -> 200`). So this could make a security test **pass by accident**. It only happens when the OS happens to pick a port another program holds, which is why it was rare and couldn't be reproduced on demand.

**REP-04's explanation was wrong.** It said "63 worker processes" collided with each other. Spec files have run **one at a time** since WS-18 (`fileParallelism: false`). A two-server reproduction of that theory (3,900 requests per mode, `repro.cjs` in scratch) found **no** wrong answers. The collision is with programs outside the test run.

**Fix:** every spec's app now **listens on loopback for its lifetime**, using `await app.listen(0, '127.0.0.1')` instead of `await app.init()` (75 specs, 76 apps).
- Bound to `127.0.0.1` explicitly, the OS cannot hand out a port another process holds there.
- supertest sees a listening server and reuses it instead of re-binding per request.

**Guard:** `test/harness-listen.e2e-spec.ts` fails if any spec calls `app.init()`, or creates an app without binding it to `127.0.0.1`. Proven red by putting `health.e2e-spec.ts` back to `app.init()`: both cases failed, naming the file. Restored, they pass.

### 2. BullMQ crashed when a queue was closed while still connecting

**This produced red runs with every test passing.**

- **Baseline:** in all 3 red runs, every test passed, and the run failed on **2 unhandled `Connection is closed.` rejections**, always attributed to `health.e2e-spec.ts`. Run alone, the health spec failed **0 of 30**. Paired with the spec that precedes it (`audit-client-write`), it failed **6 of 20**.
- **The pending command:** a scratch Redis probe named it every time: **`INFO`**, which BullMQ sends while a queue connects (its Redis-version check).
- **Root cause, a BullMQ 5.80.10 bug:**
  1. `RedisConnection` attaches `initializing.catch(err => this.emit('error', err))`.
  2. `close()` disconnects a still-connecting client and, in its `finally`, calls **`removeAllListeners()`**.
  3. The pending `INFO` then rejects with "Connection is closed". The handler's `emit('error')` has **no listener left**, so it **throws** inside the `.catch`, and that throw becomes a new unhandled rejection.

  Any app closed within milliseconds of starting could hit it.
- **Fix:** `QueueShutdownGuard` in `QueueModule`.
  - `@nestjs/bullmq` closes queues in `onApplicationShutdown`. Nest runs every `beforeApplicationShutdown` first, and there the guard waits for **every** BullMQ queue to finish connecting, so `close()` always takes its clean path. Connection errors are ignored, so a shutdown never fails because Redis was unreachable.
  - The queues are found through Nest's `DiscoveryService`, not a hand-kept list. The first version listed the two `QueueModule` queues and **missed a third**: `NotificationsModule` registers its own `dispatch` instance, which caused run 9's lone rejection in the "after" set.
  - **It also makes a real server shutdown clean.**
- **Proven in isolation:** the guard took the reproducing pair from **6/20** red to **0/20**.

## The suite still catches real failures (red-guard proof)

The employee role was temporarily granted `employee.read`, the exact unsafe grant ADR-011 warned about. Then the isolation and role-matrix specs were run:

```
× every route outside public / session / self / employee REFUSES an employee principal (403)
  → expected [ 'GET /employees -> 200', …(1) ] to deeply equal []
× employee: the bundle equals the matrix — nothing missing, nothing extra
Tests  2 failed | 27 passed (29)
```

With the grant reverted (`permissions.ts` byte-identical to before), the same specs passed 29/29.

## Gates

- API typecheck and lint clean.
- **API 517/517 on 10 consecutive full runs.**
- The scratch diagnostics (`test/.diag-redis.setup.ts`, `vitest.diag.config.ts`) were deleted before the commit.

## Notes

- The dev API (`nest start --watch`) stayed up throughout, as in every earlier run, so the measurement reflects normal conditions.
- Upstream: the BullMQ bug (`emit('error')` with listeners already removed) is worth reporting to the BullMQ project. That's an external action, left for the owner.
