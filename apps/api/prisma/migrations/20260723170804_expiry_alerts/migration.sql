-- CreateTable
CREATE TABLE "exp_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "threshold" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exp_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exp_alerts_client_id_idx" ON "exp_alerts"("client_id");

-- CreateIndex
CREATE INDEX "exp_alerts_document_id_idx" ON "exp_alerts"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "exp_alerts_document_id_threshold_key" ON "exp_alerts"("document_id", "threshold");

-- EXP-01 grants + RLS (ADR-001 standard client-scoped pattern — keyed on the
-- client_id column, per the checklist in src/modules/README.md). The daily scan
-- writes via the STAFF path (system process across all clients), so staff have
-- full access. A client-rep may READ ONLY its own client's alert history (a
-- future portal view) — SELECT-only, default deny otherwise. NULLIF is
-- load-bearing (SPIKE-001: pooled reuse leaves the GUC as '' not NULL). uuid PK,
-- no sequence to grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON "exp_alerts" TO app_staff;
GRANT SELECT ON "exp_alerts" TO app_client;

ALTER TABLE "exp_alerts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "exp_alerts"
  FOR ALL TO app_staff
  USING (true) WITH CHECK (true);

CREATE POLICY client_read ON "exp_alerts"
  FOR SELECT TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
