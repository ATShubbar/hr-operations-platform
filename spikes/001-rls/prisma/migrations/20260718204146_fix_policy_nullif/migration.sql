-- SPIKE FINDING: after a transaction-local set_config, pooled-connection
-- reuse leaves the GUC as EMPTY STRING (not NULL). ''::uuid throws, which is
-- closed-but-noisy. NULLIF maps both unset states to NULL -> clean zero rows.
DROP POLICY client_isolation ON sp_employees;
CREATE POLICY client_isolation ON sp_employees
  FOR ALL TO spike_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
