// Where the seed may run, and with which password (GCP-06).
//
// The repository is public, so DEV_SEED_PASSWORD is public. In development that
// is fine — nothing outside this machine can reach the accounts. UAT runs with
// NODE_ENV=production on the internet, so there the seed runs ONLY when told so
// explicitly (SEED_TARGET=uat) and ONLY with a password supplied from outside
// the code (Secret Manager → SEED_PASSWORD). The real production environment
// never receives SEED_TARGET, so it can never be seeded.
export const DEV_SEED_PASSWORD = 'Seed-dev-password-1';

const MIN_SUPPLIED_LENGTH = 16;

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
