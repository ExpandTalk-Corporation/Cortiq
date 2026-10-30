-- Ensure the pgcrypto extension is enabled for gen_random_bytes function
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Test that the generate_tracking_id function works properly
SELECT generate_tracking_id();