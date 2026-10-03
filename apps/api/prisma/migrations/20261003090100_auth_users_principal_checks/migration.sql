-- SS-01 (ADR-011): the database refuses an account whose bindings contradict
-- its principal type. Application code already creates each type correctly;
-- these make a wrong row IMPOSSIBLE rather than merely unexpected — an
-- employee row that also carried a client_id would read, to any code that
-- checks client_id, like a client representative of the whole company.
--
--   staff       no company, no employee record
--   client_rep  a company,  no employee record
--   employee    an employee record, no company (read from the record when
--               needed, so a transferred employee follows their record)
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_principal_binding_chk" CHECK (
     ("principal_type" = 'staff'      AND "client_id" IS NULL     AND "employee_id" IS NULL)
  OR ("principal_type" = 'client_rep' AND "client_id" IS NOT NULL AND "employee_id" IS NULL)
  OR ("principal_type" = 'employee'   AND "client_id" IS NULL     AND "employee_id" IS NOT NULL)
);

-- The `employee` role belongs to the `employee` principal and to nothing else,
-- in both directions: no staff account with the employee role (it would hold
-- self-scoped permissions with no self), and no employee with a staff role.
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_employee_role_chk" CHECK (
  ("principal_type" = 'employee') = ("role" = 'employee')
);
