// AUDIT-12: what an audit entry changed, in words.
//
// The web app has no test runner, so — like the Arabic-messages check beside it
// — this runs inside `pnpm lint`. It keeps three promises:
//
//   1. The rules in src/lib/audit-changes.ts: which fields an entry is about,
//      and how a recorded value reads (a status as its label, a day as a date, an
//      amount as a number, an account as a name).
//   2. Every field a person can change on the records the trail follows has a
//      label in BOTH languages. The list is read from the database schema, so a
//      column added later fails here until someone names it.
//   3. Every action the trail can hold has a sentence in both languages — no row
//      falls back to raw keys such as "salary-update · employee".
//
// Run with Node's type stripping: the module under test is TypeScript with no
// imports.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { changesOf, EMPTY, fieldLabel, fieldValue } from '../src/lib/audit-changes.ts';

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const en = JSON.parse(read('../messages/en.json'));
const ar = JSON.parse(read('../messages/ar.json'));

const lookup = (messages) => (path) => {
  let node = messages;
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
};
const format = (messages, locale) => ({
  locale,
  text: lookup(messages),
  userName: (id) => (id.startsWith('aaaaaaaa') ? 'Omar Al-Shehri' : null),
  clientName: (id) => (id.startsWith('cccccccc') ? 'Alpha Trading Co.' : null),
  nationality: (code) => `country:${code}`,
  day: (day) => `day:${day}`,
  hijri: (day) => `hijri:${day}`,
  instant: (iso) => `at:${iso}`,
  money: (halalas) => `SAR ${halalas / 100}`,
});
const f = format(en, 'en');
const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const STRANGER = 'bbbbbbbb-0000-4000-8000-000000000001';
const CLIENT = 'cccccccc-0000-4000-8000-000000000001';

// ---- 1. the rules ---------------------------------------------------------

// An edit: only the fields that differ; what names the record is not a change.
assert.deepEqual(
  changesOf(
    { nameEn: 'Sara', jobTitleEn: 'Clerk', basicSalary: 5000 },
    { nameEn: 'Sara', jobTitleEn: 'Accountant', basicSalary: 6500 },
  ).map((c) => c.key),
  ['jobTitleEn', 'basicSalary'],
);
// A field present on one side only is a change from / to nothing.
assert.deepEqual(changesOf({ a: 1 }, { a: 1, b: 2 }).map((c) => [c.key, c.before, c.after]), [
  ['b', undefined, 2],
]);
// A new record (no earlier side): every field, marked as having no "before".
const created = changesOf(null, { nameEn: 'Sara', nationality: 'IN' });
assert.deepEqual(created.map((c) => c.key), ['nameEn', 'nationality']);
assert.ok(created.every((c) => c.has && !c.had));
// A removed record: the other way round.
assert.ok(changesOf({ nameEn: 'Sara' }, null).every((c) => c.had && !c.has));
// Plumbing that only locates the record is never shown as a change.
assert.deepEqual(changesOf(null, { dependantId: 'x', sequenceId: 'y', nameEn: 'Sara' }).map((c) => c.key), [
  'nameEn',
]);

// Labels: translated; a key nobody has named still reads as words.
assert.equal(fieldLabel(f, 'employee', 'basicSalary'), 'Basic salary');
assert.equal(fieldLabel(f, 'employee', 'somethingBrandNew'), 'Something brand new');

// Values.
assert.equal(fieldValue(f, 'employee', 'jobTitleEn', null), EMPTY);
assert.equal(fieldValue(f, 'employee', 'jobTitleEn', ''), EMPTY);
assert.equal(fieldValue(f, 'employee', 'employmentStatus', 'on_leave'), 'On leave');
assert.equal(fieldValue(f, 'employee', 'contractType', 'fixed_term'), en.employees.contract.fixed_term);
// The same key means different things on different records.
assert.equal(fieldValue(f, 'request', 'status', 'in_progress'), en.requests.status.in_progress);
assert.equal(fieldValue(f, 'gro-process', 'status', 'submitted'), en.gro.status.submitted);
// A value with no label is shown as recorded, never dropped.
assert.equal(fieldValue(f, 'request', 'status', 'brand_new_status'), 'brand_new_status');
// A day; with the Hijri date in the full form; an instant.
assert.equal(fieldValue(f, 'employee', 'iqamaExpiry', '2027-03-03'), 'day:2027-03-03');
assert.equal(fieldValue(f, 'employee', 'iqamaExpiry', '2027-03-03', true), 'day:2027-03-03 (hijri:2027-03-03)');
assert.equal(fieldValue(f, 'calendar-event', 'startAt', '2027-01-11T08:00:00.000Z'), 'at:2027-01-11T08:00:00.000Z');
// Money: halalas as riyals; pay as a grouped number with no currency claimed.
assert.equal(fieldValue(f, 'fee', 'amountHalalas', 123400), 'SAR 1234');
assert.equal(fieldValue(f, 'employee', 'basicSalary', 12500), '12,500');
assert.equal(fieldValue(f, 'vacancy', 'headcount', 4), '4');
// People and companies by name; an account the page cannot name by a short id.
assert.equal(fieldValue(f, 'task', 'assigneeUserId', USER), 'Omar Al-Shehri');
assert.equal(fieldValue(f, 'task', 'assigneeUserId', STRANGER), '#bbbbbbbb');
assert.equal(fieldValue(f, 'employee', 'clientId', CLIENT), 'Alpha Trading Co.');
assert.equal(fieldValue(f, 'candidate', 'vacancyId', STRANGER), '#bbbbbbbb');
assert.equal(fieldValue(f, 'employee', 'nationality', 'IN'), 'country:IN');
// Yes / no; lists; signatories.
assert.equal(fieldValue(f, 'employee', 'countsTowardSaudization', true), 'Yes');
assert.equal(fieldValue(f, 'employee', 'countsTowardSaudization', false), 'No');
assert.equal(fieldValue(f, 'client', 'portals', ['qiwa', 'gosi']), `${en.clientProfile.portal.qiwa}, ${en.clientProfile.portal.gosi}`);
assert.equal(fieldValue(f, 'client', 'portals', []), EMPTY);
assert.equal(fieldValue(f, 'client', 'signatories', [{ name: 'Sara', role: 'CEO' }]), 'Sara (CEO)');
// Arabic uses its own comma.
assert.ok(fieldValue(format(ar, 'ar'), 'client', 'portals', ['qiwa', 'gosi']).includes('، '));

// ---- 2. every changeable field has a label in both languages -----------------

const schema = read('../../api/prisma/schema.prisma');
const BOOKKEEPING = new Set(['id', 'createdAt', 'updatedAt']);
// Records whose edits are written field by field (AUDIT-11).
const MODELS = ['Employee', 'Dependant', 'Candidate', 'Request', 'Task', 'Vacancy', 'GroProcess', 'CalendarEvent', 'GcalInvitation', 'Client'];
const problems = [];
for (const model of MODELS) {
  const body = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema)?.[1];
  assert.ok(body, `model ${model} not found in the schema`);
  for (const line of body.split('\n')) {
    const field = /^\s{2}([a-z][A-Za-z0-9]*)\s+([A-Za-z]+)(\[\])?/.exec(line);
    if (!field) continue;
    const [, name, type, list] = field;
    // A relation to another model (or a list of them) is not a column.
    if (list || new RegExp(`^model ${type} \\{`, 'm').test(schema)) continue;
    if (BOOKKEEPING.has(name) || name === 'dependantId') continue;
    for (const [language, messages] of [['en', en], ['ar', ar]]) {
      if (typeof messages.auditField?.[name] !== 'string') {
        problems.push(`${model}.${name} has no label in auditField (${language})`);
      }
    }
  }
}
// The two languages name the same fields.
const onlyEn = Object.keys(en.auditField).filter((k) => !(k in ar.auditField));
const onlyAr = Object.keys(ar.auditField).filter((k) => !(k in en.auditField));
if (onlyEn.length || onlyAr.length) {
  problems.push(`auditField differs between the languages: ${[...onlyEn, ...onlyAr].join(', ')}`);
}

// ---- 3. every action has a sentence in both languages -------------------------

// Every action a route records (the API's write and read registry), plus the
// ones the server writes by itself, outside a route.
const registry = read('../../api/test/audit/audited-writes.ts');
const pairs = new Set([...registry.matchAll(/:\s*'([a-z-]+)\.([a-z-]+)'/g)].map((m) => `${m[1]}.${m[2]}`));
for (const written of [
  'employee.salary-update',
  'employee.govdata-update',
  'employee.terminate',
  'employee.gro-completion',
  'employee-user.deactivate-on-termination',
  'gro-sequence.complete',
  'request.info-returned',
  'request.service-level-set',
  'request.service-level-paused',
  'leave-balance.carry-over',
  'auth-account.activate',
  'auth-account.reset-password',
]) {
  pairs.add(written);
}
// In the registry under a name no entry carries: pay and ID edits are written as
// employee.salary-update / employee.govdata-update (listed above), and
// scope-check is the walking skeleton's test route.
for (const nominal of ['salary.update', 'govdata.update', 'scope-check.create']) pairs.delete(nominal);
assert.ok(pairs.size > 60, `only ${pairs.size} actions found — the registry was not read`);
for (const pair of pairs) {
  const [resource, action] = pair.split('.');
  for (const [language, messages] of [['en', en], ['ar', ar]]) {
    const a = messages.audit;
    const said = a.phrase?.[`${resource}__${action}`] ?? (a.verb?.[action] && a.noun?.[resource]);
    if (!said) problems.push(`${pair} has no sentence in audit.phrase (${language})`);
  }
}

if (problems.length > 0) {
  console.error(`Audit changes (AUDIT-12):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `Audit changes: the rules hold; ${Object.keys(en.auditField).length} field labels and ${pairs.size} action sentences in both languages.`,
);
