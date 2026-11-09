-- supabase/migrations/20261112000001_drop_warehouse_connectors.sql
-- Remove the data-warehouse connector. It never synced anything: "test connection" only checked
-- that credential fields were present, and sync jobs were inserted as 'pending' with no worker.
-- It also stored warehouse passwords as plain jsonb. Public copy already lists data-warehouse
-- export as not included. All five tables were empty in production on 2026-11-09.

DROP FUNCTION IF EXISTS public.test_warehouse_connection(uuid);
DROP FUNCTION IF EXISTS public.schedule_warehouse_sync(uuid, character varying, date, date);
DROP FUNCTION IF EXISTS public.log_warehouse_audit(uuid, character varying, text, jsonb);

DROP TABLE IF EXISTS public.warehouse_audit_log CASCADE;
DROP TABLE IF EXISTS public.warehouse_data_quality CASCADE;
DROP TABLE IF EXISTS public.warehouse_table_schemas CASCADE;
DROP TABLE IF EXISTS public.warehouse_sync_jobs CASCADE;
DROP TABLE IF EXISTS public.warehouse_connectors CASCADE;
