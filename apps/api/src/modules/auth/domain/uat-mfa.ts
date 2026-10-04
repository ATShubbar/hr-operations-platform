// UAT-01 (owner decision, recorded in ADR-013): UAT — sample data only — signs
// in without an authenticator. The switch takes effect ONLY when the app is
// served from the UAT address, so production (app.peopleandgro.com) can never
// lose MFA, even if UAT_DISABLE_MFA were copied into its config by mistake.
export const UAT_ORIGIN = 'https://uat.peopleandgro.com';

export function mfaSwitchedOffForUat(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.UAT_DISABLE_MFA === 'true' && env.APP_WEB_ORIGIN === UAT_ORIGIN;
}
