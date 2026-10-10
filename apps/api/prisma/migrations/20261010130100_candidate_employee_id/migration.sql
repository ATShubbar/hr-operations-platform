-- AlterTable
ALTER TABLE "rec_candidates" ADD COLUMN     "employee_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "rec_candidates_employee_id_key" ON "rec_candidates"("employee_id");


-- MOB-04b (ADR-018): a candidate in (or past) Visa & mobilisation points at the
-- employee record made for them. Facts the application must not break: the
-- stage `mobilisation` always has its employee.
ALTER TABLE "rec_candidates"
  ADD CONSTRAINT "rec_candidates_mobilisation_chk" CHECK ("stage" <> 'mobilisation' OR "employee_id" IS NOT NULL);
