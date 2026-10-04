// Where the seed may run, and with which password (GCP-06).
//
// The repository is public, so DEV_SEED_PASSWORD is public. In development that
// is fine — nothing outside this machine can reach the accounts. UAT runs with
// NODE_ENV=production on the internet, so there the seed runs ONLY when told so
// explicitly (SEED_TARGET=uat) and ONLY with a password supplied from outside
// the code (Secret Manager → SEED_PASSWORD). The real production environment
// never receives SEED_TARGET, so it can never be seeded.
export const DEV_SEED_PASSWORD = 'Seed-dev-password-1';

// UAT-01: the owner chose a short shared UAT password (sample data only). 8 is
// the floor; the public dev password stays refused whatever its length.
const MIN_SUPPLIED_LENGTH = 8;

type SeedEnv = Readonly<Record<string, string | undefined>>;

export function seedPasswordFor(env: SeedEnv): string {
  const supplied = env.SEED_PASSWORD;

  if (env.NODE_ENV !== 'production') return supplied || DEV_SEED_PASSWORD;

  if (env.SEED_TARGET !== 'uat') {
    throw new Error(
      'Refusing to seed: NODE_ENV=production. Only UAT may be seeded, and only with SEED_TARGET=uat.',
    );
  }
  if (!supplied || supplied.length < MIN_SUPPLIED_LENGTH || supplied === DEV_SEED_PASSWORD) {
    throw new Error(
      `Refusing to seed UAT: SEED_PASSWORD must be supplied (at least ${MIN_SUPPLIED_LENGTH} characters, never the public dev password).`,
    );
  }
  return supplied;
}

// UAT-01 (owner decision): on UAT the seed accounts are simple addresses at the
// company domain — one obvious login per role, the first account of each role
// keeping the sample work assigned to it. Everywhere else (local dev, CI, the
// e2e suite, which signs in as these accounts) they stay @seed.hr.local.
export const SEED_USER_DOMAIN = 'seed.hr.local';

export const UAT_SEED_EMAILS: Readonly<Record<string, string>> = {
  'staff-administrator': 'admin@peopleandgro.com',
  'staff-administrator-2': 'admin2@peopleandgro.com',
  'staff-hr_officer': 'hr@peopleandgro.com',
  'staff-hr_officer-2': 'hr2@peopleandgro.com',
  'staff-hr_officer-3': 'hr3@peopleandgro.com',
  'staff-gro_officer': 'gro@peopleandgro.com',
  'staff-auditor': 'auditor@peopleandgro.com',
  'client_manager-a': 'client@peopleandgro.com',
  'client_manager-b': 'client2@peopleandgro.com',
  'employee-a': 'employee@peopleandgro.com',
};

export function seedEmailFor(local: string, env: SeedEnv): string {
  if (env.NODE_ENV !== 'production' || env.SEED_TARGET !== 'uat') return `${local}@${SEED_USER_DOMAIN}`;
  const email = UAT_SEED_EMAILS[local];
  if (!email) throw new Error(`Seed account '${local}' has no UAT address (seed-guard.ts UAT_SEED_EMAILS).`);
  return email;
}


// SEED-01: where the seed writes the files behind its documents. In development
// (and CI) the same local MinIO defaults as the app's StorageService; on UAT
// EVERY setting must be supplied (Secret Manager + the workflow's env), so UAT is
// never seeded silently without its files.
export interface SeedStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const STORAGE_DEV_DEFAULTS = {
  STORAGE_ENDPOINT: 'http://localhost:9002',
  STORAGE_REGION: 'us-east-1',
  STORAGE_BUCKET: 'hr-documents',
  STORAGE_ACCESS_KEY: 'hr_minio',
  STORAGE_SECRET_KEY: 'hr_minio_dev_pw',
} as const;

export function seedStorageFor(env: SeedEnv): SeedStorageConfig {
  const uat = env.NODE_ENV === 'production';
  const keys = Object.keys(STORAGE_DEV_DEFAULTS) as (keyof typeof STORAGE_DEV_DEFAULTS)[];
  if (uat) {
    const missing = keys.filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(`Refusing to seed UAT without its file storage: ${missing.join(', ')} not supplied.`);
    }
  }
  const get = (k: keyof typeof STORAGE_DEV_DEFAULTS) => env[k] || STORAGE_DEV_DEFAULTS[k];
  return {
    endpoint: get('STORAGE_ENDPOINT'),
    region: get('STORAGE_REGION'),
    bucket: get('STORAGE_BUCKET'),
    accessKeyId: get('STORAGE_ACCESS_KEY'),
    secretAccessKey: get('STORAGE_SECRET_KEY'),
  };
}
