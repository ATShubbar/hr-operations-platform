-- INS-04: the standard-fees setting must name EVERY procedure type (its schema
-- is strict and complete, so a missing key is refused on the next save and reads
-- as "no fee" until then). Where an Administrator has already SAVED the setting,
-- add the three new types with their defaults. Where nobody has, there is no
-- row and the code's defaults apply — this changes nothing.
--
-- Only MISSING keys are added: a figure someone already set is never touched.
UPDATE "cfg_system_settings"
SET "value" = jsonb_set(
      "value",
      '{procedures}',
      '{"medical_insurance_renewal": 180000, "driving_licence_renewal": 0, "driving_licence_conversion": 40000}'::jsonb
        || ("value" -> 'procedures')
    ),
    "updated_at" = now()
WHERE "key" = 'billing.standard-fees'
  AND jsonb_typeof("value" -> 'procedures') = 'object'
  AND NOT ("value" -> 'procedures' ?& ARRAY['medical_insurance_renewal', 'driving_licence_renewal', 'driving_licence_conversion']);
