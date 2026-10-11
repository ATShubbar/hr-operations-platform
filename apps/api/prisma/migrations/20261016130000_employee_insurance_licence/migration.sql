-- INS-01: medical insurance and driving licence on the employee record — a number
-- and an expiry date each, all optional (no date = not watched).
--
-- No grant changes: emp_employees is granted per TABLE (app_staff CRUD,
-- app_client SELECT, app_employee SELECT under employee_self), so the new columns
-- follow the row rules already in place. Which audience SEES a number is decided
-- by the response mappers (employee-view.ts), as for the iqama number.
ALTER TABLE "emp_employees"
  ADD COLUMN "medical_insurance_number" TEXT,
  ADD COLUMN "medical_insurance_expiry" DATE,
  ADD COLUMN "driving_licence_number" TEXT,
  ADD COLUMN "driving_licence_expiry" DATE;

-- A number is a real value or absent — never blank, never a paragraph.
ALTER TABLE "emp_employees"
  ADD CONSTRAINT "emp_employees_medical_insurance_number_chk"
    CHECK ("medical_insurance_number" IS NULL
           OR (btrim("medical_insurance_number") <> '' AND char_length("medical_insurance_number") <= 60)),
  ADD CONSTRAINT "emp_employees_driving_licence_number_chk"
    CHECK ("driving_licence_number" IS NULL
           OR (btrim("driving_licence_number") <> '' AND char_length("driving_licence_number") <= 60));
