/* global process, fetch, Buffer */
// UAT smoke check (GCP-06). Runs as the Cloud Run job `uat-smoke`, inside
// Google, with SEED_PASSWORD injected from Secret Manager — the password is
// never printed, and nobody types it into a browser on our behalf.
//
// It talks to UAT exactly as a browser does: through the public web address,
// whose /api/* is proxied to the internal API. Per role it proves sign-in, one
// allowed screen and one refused one; then a real document round-trip through
// the bucket; then a request whose status change notifies its client manager —
// that notification is emailed by the BullMQ WORKER, so its log line
// `email → client_manager-a@seed.hr.local` proves the worker processes jobs —
// with a PDF attached to its thread and removed again (THREAD-02).
//
// Administrator and Auditor are checked only on UAT (SMOKE_ACCOUNTS=uat), where
// UAT-01 removed the authenticator; elsewhere both must enrol one, and a script
// must not enrol one on anybody's behalf.

const BASE = (process.env.SMOKE_BASE ?? 'https://uat.peopleandgro.com').replace(/\/+$/, '');
const PASSWORD = process.env.SEED_PASSWORD ?? '';
const DOMAIN = 'seed.hr.local';
// UAT-01: on UAT the seed accounts are simple @peopleandgro.com logins and no
// role needs an authenticator, so Administrator and Auditor are checked too.
const UAT = process.env.SMOKE_ACCOUNTS === 'uat';
const UAT_EMAILS = {
  'staff-administrator': 'admin@peopleandgro.com',
  'staff-hr_officer': 'hr@peopleandgro.com',
  'staff-gro_officer': 'gro@peopleandgro.com',
  'staff-auditor': 'auditor@peopleandgro.com',
  'client_manager-a': 'client@peopleandgro.com',
  'employee-a': 'employee@peopleandgro.com',
};
const emailOf = (user) => (UAT ? UAT_EMAILS[user] : `${user}@${DOMAIN}`);
const CLIENT_A = '11111111-1111-4111-8111-111111111111';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}\n`);
};

async function call(path, { cookie, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // not JSON — the status is what matters
  }
  return { status: res.status, json, headers: res.headers };
}

async function signIn(user) {
  const res = await call('/auth/login', {
    method: 'POST',
    body: { email: emailOf(user), password: PASSWORD },
  });
  const set = res.headers.getSetCookie?.() ?? [];
  const session = set.map((c) => c.split(';')[0]).find((c) => c.startsWith('hr_session='));
  const full = res.status === 200 && session && !res.json?.mfaRequired && !res.json?.mfaEnrollRequired;
  check(Boolean(full), `${user}: signs in`, `HTTP ${res.status}`);
  return full ? session : null;
}

// One allowed and one refused route per role (architecture.md v1.7 matrix).
const ROLES = [
  { user: 'staff-hr_officer', role: 'hr_officer', allowed: '/employees', refused: '/audit' },
  { user: 'staff-gro_officer', role: 'gro_officer', allowed: '/gro-processes', refused: '/reports' },
  { user: 'client_manager-a', role: 'client_manager', allowed: '/requests', refused: '/tasks' },
  { user: 'employee-a', role: 'employee', allowed: '/auth/me', refused: '/employees' },
  // Only where no authenticator is required (UAT-01); `/me` is employee-only.
  ...(UAT
    ? [
        { user: 'staff-administrator', role: 'administrator', allowed: '/audit', refused: '/me' },
        { user: 'staff-auditor', role: 'auditor', allowed: '/audit', refused: '/me' },
      ]
    : []),
];

async function main() {
  if (PASSWORD.length < 8) {
    check(false, 'SEED_PASSWORD is present');
    return;
  }

  const health = await call('/health');
  check(health.status === 200 && health.json?.status === 'ok', 'health', `version ${health.json?.version}`);
  const ready = await call('/ready');
  check(ready.status === 200, 'ready (database + Redis)');

  const sessions = {};
  for (const r of ROLES) {
    const cookie = await signIn(r.user);
    if (!cookie) continue;
    sessions[r.role] = cookie;
    const me = await call('/auth/me', { cookie });
    check(me.json?.role === r.role, `${r.user}: is ${r.role}`, `got ${me.json?.role}`);
    const ok = await call(r.allowed, { cookie });
    check(ok.status === 200, `${r.user}: GET ${r.allowed} allowed`, `HTTP ${ok.status}`);
    const no = await call(r.refused, { cookie });
    check(no.status === 403, `${r.user}: GET ${r.refused} refused`, `HTTP ${no.status}`);
  }

  // A real file through the bucket: issue → PUT to the presigned URL → confirm
  // (virus-scan hook) → presigned download → same bytes back.
  const hr = sessions.hr_officer;
  if (hr) {
    const text = `uat smoke ${new Date().toISOString()}`;
    const issued = await call('/documents', {
      cookie: hr,
      method: 'POST',
      body: {
        clientId: CLIENT_A,
        category: 'other',
        title: 'UAT smoke check',
        fileName: 'uat-smoke.txt',
        contentType: 'text/plain',
        sizeBytes: Buffer.byteLength(text),
      },
    });
    check(issued.status === 201, 'document: upload issued', `HTTP ${issued.status}`);
    if (issued.status === 201) {
      const { document, upload } = issued.json;
      const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: text });
      check(put.ok, 'document: bytes stored in the bucket', `HTTP ${put.status}`);
      const confirmed = await call(`/documents/${document.id}/confirm`, { cookie: hr, method: 'POST' });
      check(confirmed.json?.status === 'available', 'document: scanned and available', `${confirmed.json?.status}`);
      const dl = await call(`/documents/${document.id}/download`, { cookie: hr });
      const got = dl.json?.url ? await (await fetch(dl.json.url)).text() : null;
      check(got === text, 'document: download returns the same bytes');
      const removed = await call(`/documents/${document.id}`, { cookie: hr, method: 'DELETE' });
      check(removed.status === 200, 'document: cleaned up', `HTTP ${removed.status}`);
    }
  }

  // A request raised by the client manager, picked up by HR → the client
  // manager is notified → the WORKER emails it (capture transport on UAT).
  const cm = sessions.client_manager;
  if (cm && hr) {
    const raised = await call('/requests', {
      cookie: cm,
      method: 'POST',
      body: { type: 'letter', title: `UAT smoke ${new Date().toISOString()}` },
    });
    check(raised.status === 201, 'request: raised by the client manager', `HTTP ${raised.status}`);
    // THREAD-04: a letter gets its service level's due date (working days).
    check(
      Boolean(raised.json?.dueDate) && Number.isInteger(raised.json?.serviceLevelDays),
      'request: due date set from its service level',
      `due ${raised.json?.dueDate} · ${raised.json?.serviceLevelDays} working days`,
    );
    if (raised.json?.id) {
      const moved = await call(`/requests/${raised.json.id}/process`, {
        cookie: hr,
        method: 'POST',
        body: { status: 'in_progress' },
      });
      check(moved.json?.status === 'in_progress', 'request: taken up by HR', `HTTP ${moved.status}`);
      // THREAD-02: a file on that request's thread — the client manager attaches
      // a PDF (presigned PUT → confirm runs the virus + type check), HR downloads
      // the same bytes, and the uploader removes it again (soft: a "removed" line).
      const pdf = `%PDF-1.4\n% uat smoke ${new Date().toISOString()}\n%%EOF\n`;
      const files = `/requests/${raised.json.id}/attachments`;
      const issuedFile = await call(files, {
        cookie: cm,
        method: 'POST',
        body: { fileName: 'uat-smoke.pdf', contentType: 'application/pdf', sizeBytes: Buffer.byteLength(pdf) },
      });
      check(issuedFile.status === 201, 'attachment: upload issued to the client manager', `HTTP ${issuedFile.status}`);
      if (issuedFile.status === 201) {
        const { attachment, upload } = issuedFile.json;
        const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: pdf });
        check(put.ok, 'attachment: bytes stored in the bucket', `HTTP ${put.status}`);
        const ok = await call(`${files}/${attachment.id}/confirm`, { cookie: cm, method: 'POST' });
        check(ok.json?.status === 'available', 'attachment: checked and available', `${ok.json?.status}`);
        const dl = await call(`${files}/${attachment.id}/download`, { cookie: hr });
        const got = dl.json?.url ? await (await fetch(dl.json.url)).text() : null;
        check(got === pdf, 'attachment: HR downloads the same bytes');
        const gone = await call(`${files}/${attachment.id}`, { cookie: cm, method: 'DELETE' });
        check(gone.json?.status === 'removed', 'attachment: removed by its uploader', `HTTP ${gone.status}`);
      }
      process.stdout.write(
        `INFO  worker proof: look for "email → ${emailOf('client_manager-a')}" in the uat-worker log after ${new Date().toISOString()} (request ${raised.json.id})\n`,
      );
    }
  }

  // Leave (LEAVE-06): HR raises for one of company A's people, the client
  // manager approves, HR files — the employer-decides / PEOPLE&GRO-files flow.
  if (cm && hr) {
    const people = await call('/leave/balances', { cookie: hr });
    const someone = people.json?.balances?.find((b) => b.employee.clientId === CLIENT_A)?.employee;
    check(Boolean(someone), 'leave: balances list a company-A employee', `HTTP ${people.status}`);
    if (someone) {
      const start = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
      const raisedLeave = await call('/leave', {
        cookie: hr,
        method: 'POST',
        body: { employeeId: someone.id, type: 'annual', startDate: start, days: 1, details: 'UAT smoke check' },
      });
      check(raisedLeave.status === 201, 'leave: raised by HR', `HTTP ${raisedLeave.status}`);
      if (raisedLeave.json?.id) {
        const id = raisedLeave.json.id;
        const approvedLeave = await call(`/leave/${id}/approve`, { cookie: cm, method: 'POST' });
        check(approvedLeave.json?.status === 'approved', 'leave: approved by the client manager', `HTTP ${approvedLeave.status}`);
        const refused = await call(`/leave/${id}/file`, { cookie: cm, method: 'POST' });
        check(refused.status === 403, 'leave: the client manager cannot file', `HTTP ${refused.status}`);
        const filed = await call(`/leave/${id}/file`, { cookie: hr, method: 'POST' });
        check(filed.json?.status === 'filed', 'leave: filed by HR', `HTTP ${filed.status}`);
      }
    }
  }

  for (const cookie of Object.values(sessions)) {
    await call('/auth/logout', { cookie, method: 'POST' });
  }
}

main()
  .catch((err) => check(false, 'smoke run', err instanceof Error ? err.message : String(err)))
  .finally(() => {
    process.stdout.write(failures ? `\n${failures} check(s) FAILED\n` : '\nAll checks passed\n');
    process.exitCode = failures ? 1 : 0;
  });
