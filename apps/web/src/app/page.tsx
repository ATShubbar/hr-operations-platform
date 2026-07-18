import { clientCompanySchema, type ClientCompany } from '@hr/contracts';

// Placeholder page. Its one real job: prove that shared contracts flow
// end-to-end — the sample below is validated at render time by the same
// Zod schema the API will use. Layout uses logical utilities only
// (ps-/pe-/ms-/text-start), never physical left/right (ADR-005).
const sample: ClientCompany = clientCompanySchema.parse({
  id: 'f6a7c8d0-1234-4b5c-9d0e-abcdef012345',
  name: { ar: 'شركة المثال', en: 'Example Company' },
  status: 'active',
});

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl ps-6 pe-6 pt-16">
      <h1 className="text-2xl font-medium text-start">HR Operations Platform</h1>
      <p className="mt-2 text-gray-600 text-start">
        Walking skeleton — web app scaffold (WS-06).
      </p>
      <section className="mt-8 rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-500">
          Shared contract check (@hr/contracts)
        </h2>
        <dl className="mt-3 space-y-1">
          <div className="flex gap-2">
            <dt className="font-medium">Client:</dt>
            <dd>
              {sample.name.en} / {sample.name.ar}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">Status:</dt>
            <dd>{sample.status}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
