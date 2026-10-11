/* global process, fetch, Buffer */
// UAT smoke check (GCP-06). Runs as the Cloud Run job `uat-smoke`, inside
// Google, with SEED_PASSWORD injected from Secret Manager — the password is
// never printed, and nobody types it into a browser on our behalf.
//
// It talks to UAT exactly as a browser does: through the public web address,
// whose /api/* is proxied to the internal API. Per role it proves sign-in, one
// allowed screen and one refused one; then a real document round-trip through
// the bucket, and the seed's own files (SEED-01); then a request whose status
// change notifies its client manager —
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
const CLIENT_B = '22222222-2222-4222-8222-222222222222';

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

  // SEED-01: the SEEDED files are real — a seeded document (Ahmed Hassan's
  // iqama) and the client manager's sample attachment both download as PDFs.
  if (hr) {
    const pdfAt = async (path) => {
      const link = await call(path, { cookie: hr });
      if (!link.json?.url) return `HTTP ${link.status}`;
      const head = Buffer.from(await (await fetch(link.json.url)).arrayBuffer()).subarray(0, 5).toString('latin1');
      return head;
    };
    const doc = await pdfAt('/documents/d0000001-0000-4000-8000-000000000001/download');
    check(doc === '%PDF-', 'seed: a seeded document downloads as a PDF', doc);
    const file = await pdfAt(
      '/requests/a0000001-0000-4000-8000-000000000001/attachments/f0000001-0000-4000-8000-000000000001/download',
    );
    check(file === '%PDF-', 'seed: a seeded request attachment downloads as a PDF', file);
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

  // Billing (BILL-06, ADR-020) — read-only: the seeded ledger is there for the
  // officers, the commercial side is closed to them and to clients, and the
  // Administrator sees the seeded overdue standing (derived, never set).
  if (hr) {
    const fees = await call(`/fees?clientId=${CLIENT_A}`, { cookie: hr });
    check(
      fees.status === 200 && fees.json?.fees?.some((f) => f.ref === 'GF-S02'),
      'billing: HR reads the seeded fee ledger',
      `HTTP ${fees.status}`,
    );
    const closed = await call(`/billing/clients/${CLIENT_A}`, { cookie: hr });
    check(closed.status === 403, 'billing: commercial terms refused to HR', `HTTP ${closed.status}`);
  }
  if (cm) {
    const none = await call('/fees', { cookie: cm });
    check(none.status === 403, 'billing: the fee ledger is refused to a client manager', `HTTP ${none.status}`);
  }

  // Export register (SOON-01) — the People list as a file. It writes one audit
  // entry per run, which is what an export is supposed to do.
  if (hr) {
    const file = await call('/employees/export', { cookie: hr, method: 'POST', body: {} });
    check(
      file.status === 200 &&
        (file.headers.get('content-type') ?? '').startsWith('text/csv') &&
        Number(file.headers.get('x-export-rows')) > 0,
      'export register: HR downloads the register',
      `HTTP ${file.status}, ${file.headers.get('x-export-rows')} rows`,
    );
  }
  if (cm) {
    const refused = await call('/employees/export', { cookie: cm, method: 'POST', body: {} });
    check(
      refused.status === 403,
      'export register: the staff route is refused to a client manager',
      `HTTP ${refused.status}`,
    );
  }
  if (sessions.administrator) {
    const beta = await call(`/billing/clients/${CLIENT_B}`, { cookie: sessions.administrator });
    check(
      beta.json?.standing?.state === 'overdue' && beta.json?.terms?.cycle === 'monthly',
      'billing: the Administrator sees the seeded terms and the overdue standing',
      `HTTP ${beta.status} ${beta.json?.standing?.state}`,
    );
  }

  // The notification centre (NC-06, ADR-021): the ladder is DERIVED from the
  // seeded dates, so this also proves the seed still lands on every stage.
  const urgent = (i) => i.told && !i.read && (i.stage === 'breach' || i.stage === 'escalation');
  if (hr) {
    const ladder = await call('/escalations', { cookie: hr });
    const items = ladder.json?.items ?? [];
    const stages = new Set(items.map((i) => i.stage));
    check(
      ladder.status === 200 && ['breach', 'escalation', 'reminder', 'notice'].every((st) => stages.has(st)),
      'ladder: HR sees something at every stage',
      `HTTP ${ladder.status}, ${items.length} items, stages ${[...stages].join('/')}`,
    );
    const count = await call('/escalations/count', { cookie: hr });
    check(
      count.json?.needsAction === items.filter(urgent).length,
      'ladder: the bell count matches the items',
      `${count.json?.needsAction} vs ${items.filter(urgent).length}`,
    );
    const first = items.find((i) => !i.read);
    if (first) {
      const marked = await call('/escalations/read', { cookie: hr, method: 'POST', body: { keys: [first.key] } });
      const again = await call('/escalations', { cookie: hr });
      check(
        marked.json?.marked === 1 && again.json?.items?.find((i) => i.key === first.key)?.read === true,
        'ladder: an item is marked read and stays read',
        `HTTP ${marked.status}`,
      );
    }
    const refused = await call('/config/system/escalation.thresholds', {
      cookie: hr,
      method: 'PATCH',
      body: { value: ladder.json?.thresholds },
    });
    check(refused.status === 403, 'ladder: HR cannot change the thresholds', `HTTP ${refused.status}`);
  }
  if (cm) {
    const ladder = await call('/escalations', { cookie: cm });
    const items = ladder.json?.items ?? [];
    check(
      ladder.status === 200 &&
        items.every((i) => i.stage === 'breach' && i.owner === null && i.client?.id === CLIENT_A),
      'ladder: a client manager sees only breaches at their own company, with no staff named',
      `HTTP ${ladder.status}, ${items.length} items`,
    );
  }
  if (sessions.employee) {
    const own = await call('/me/escalations', { cookie: sessions.employee });
    const items = own.json?.items ?? [];
    check(
      own.status === 200 && items.length > 0 && items.every((i) => i.mine && i.owner === null),
      'ladder: an employee sees the items about their own record',
      `HTTP ${own.status}, ${items.length} items`,
    );
    const staffRoute = await call('/escalations', { cookie: sessions.employee });
    check(staffRoute.status === 403, 'ladder: the staff ladder is refused to an employee', `HTTP ${staffRoute.status}`);
  }

  // Medical insurance and driving licence (INS-01..03): stored on the record,
  // watched by the ladder, and the employee sees their own numbers.
  if (hr) {
    const ladder = await call('/escalations', { cookie: hr });
    const docs = new Set(
      (ladder.json?.items ?? []).filter((i) => i.subject?.kind === 'document').map((i) => i.subject.doc),
    );
    check(
      docs.has('medical_insurance') && docs.has('driving_licence'),
      'insurance and licence: both are on the ladder',
      `documents on the ladder: ${[...docs].join(', ')}`,
    );
    // INS-04: Joseph Santos's insurance lapses in days, but its renewal is open
    // (a seeded procedure) — so the expiry is quiet and counted as such.
    const quietKey = 'expiry:e0000001-0000-4000-8000-000000000006:medical_insurance';
    const procedures = await call('/gro-processes', { cookie: hr });
    const renewal = (procedures.json?.processes ?? []).find(
      (p) => p.type === 'medical_insurance_renewal' && p.employeeId === 'e0000001-0000-4000-8000-000000000006',
    );
    check(
      Boolean(renewal) &&
        !(ladder.json?.items ?? []).some((i) => i.key === quietKey) &&
        (ladder.json?.suppressed ?? 0) > 0,
      'insurance and licence: an open renewal keeps its expiry quiet',
      `renewal ${renewal?.status ?? 'missing'}, quiet items ${ladder.json?.suppressed}`,
    );
    // MOB-06: a READY step of a running onboarding / final exit is work — it has
    // an owner through its run, sits in the calendar's data on its target date,
    // and follows the bell's queue rule.
    const runs = await call('/gro-sequences?status=running', { cookie: hr });
    const inFlight = runs.json?.sequences ?? [];
    const ready = inFlight.flatMap((r) => r.steps.filter((st) => st.state === 'ready').map((st) => ({ r, st })));
    const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const cal = await call(`/calendar/view?from=${day(-120)}T00:00:00Z&to=${day(120)}T23:59:59Z`, { cookie: hr });
    const calSteps = (cal.json?.items ?? []).filter((i) => i.kind === 'step');
    check(
      runs.status === 200 &&
        ready.length > 0 &&
        inFlight.every((r) => 'assigneeUserId' in r) &&
        inFlight.some((r) => r.assigneeUserId) &&
        calSteps.length === ready.length &&
        calSteps.every((i) => i.step?.key && i.status === 'ready'),
      'sequence steps: every ready step is in the calendar, and runs carry an owner',
      `${inFlight.length} running, ${ready.length} ready steps, ${calSteps.length} in the calendar`,
    );
    const stepItems = (ladder.json?.items ?? []).filter((i) => i.subject?.kind === 'sequence_step');
    const readyKeys = new Set(ready.map(({ r, st }) => `step:${r.id}:${st.key}`));
    check(
      stepItems.every((i) => readyKeys.has(i.key) && i.rule === 'queue'),
      'sequence steps: the bell lists only ready steps, under the queue rule',
      `${stepItems.length} step item(s) on the ladder`,
    );
    // DEP-06: a dependant's iqama renewal is a procedure on the sponsor. Staff
    // see it, NAMED; its expiry is quiet; and the client manager of the same
    // company never sees it (a database policy — clients see nothing of a family).
    const depRenewal = (procedures.json?.processes ?? []).find((p) => p.type === 'dependant_iqama_renewal');
    check(
      Boolean(depRenewal?.dependant?.nameEn) &&
        !(ladder.json?.items ?? []).some((i) => i.key === `dependant:${depRenewal?.dependant?.id}:iqama`),
      'dependant renewal: staff see it named, and its iqama is quiet',
      `renewal ${depRenewal ? depRenewal.status : 'missing'}`,
    );
    if (cm && depRenewal) {
      const theirs = await call('/gro-processes', { cookie: cm });
      const direct = await call(`/gro-processes/${depRenewal.id}`, { cookie: cm });
      check(
        theirs.status === 200 &&
          (theirs.json?.processes ?? []).length > 0 &&
          !(theirs.json?.processes ?? []).some((p) => p.type === 'dependant_iqama_renewal') &&
          direct.status === 404,
        'dependant renewal: hidden from the client manager of the same company',
        `list HTTP ${theirs.status} (${(theirs.json?.processes ?? []).length} procedures), by id HTTP ${direct.status}`,
      );
    }
    // Ahmed Hassan — a fixed seed id, with a policy and a licence on file.
    const person = await call('/employees/e0000001-0000-4000-8000-000000000002', { cookie: hr });
    const gov = person.json?.govdata ?? {};
    check(
      person.status === 200 &&
        [gov.medicalInsuranceNumber, gov.medicalInsuranceExpiry, gov.drivingLicenceNumber, gov.drivingLicenceExpiry].every(Boolean),
      'insurance and licence: an officer reads the numbers and dates on the record',
      `HTTP ${person.status}`,
    );
  }
  if (sessions.employee) {
    const me = await call('/me', { cookie: sessions.employee });
    const ids = me.json?.identifiers ?? {};
    check(
      me.status === 200 && Boolean(ids.medicalInsuranceNumber) && Boolean(ids.medicalInsuranceExpiry),
      'insurance and licence: the employee sees their own policy number and date',
      `HTTP ${me.status}`,
    );
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
