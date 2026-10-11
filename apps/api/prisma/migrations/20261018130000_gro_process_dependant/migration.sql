-- DEP-06a (ADR-017 rev. 2): a procedure can name a dependant.

ALTER TABLE "gro_processes" ADD COLUMN "dependant_id" UUID;
CREATE INDEX "gro_processes_dependant_id_idx" ON "gro_processes"("dependant_id");

-- A dependant procedure names its dependant, and nothing else names one — for
-- any writer.
ALTER TABLE "gro_processes"
  ADD CONSTRAINT "gro_processes_dependant_chk"
    CHECK (("type" = 'dependant_iqama_renewal') = ("dependant_id" IS NOT NULL));

-- One renewal in flight per dependant. Finished ones (completed / cancelled) do
-- not count: a new one may start the following year.
CREATE UNIQUE INDEX "gro_processes_one_open_per_dependant"
  ON "gro_processes"("dependant_id")
  WHERE "dependant_id" IS NOT NULL AND "status" NOT IN ('completed', 'cancelled');

-- A CLIENT never sees a dependant procedure. Client managers read their own
-- company's procedures (status only), but a row that says "dependant iqama
-- renewal for employee X" would tell them a family exists — and ADR-017 gives
-- clients nothing of a family. RESTRICTIVE, so it ANDs with client_isolation:
-- the fence is in the database, not in each query that happens to read the table.
CREATE POLICY client_no_dependant_procedures ON "gro_processes"
  AS RESTRICTIVE
  FOR SELECT TO app_client
  USING ("dependant_id" IS NULL);
