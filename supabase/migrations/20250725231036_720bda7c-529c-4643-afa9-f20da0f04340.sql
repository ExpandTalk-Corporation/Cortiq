-- Drop and recreate the tracking ID function using gen_random_uuid instead
DROP FUNCTION IF EXISTS public.generate_tracking_id();

CREATE OR REPLACE FUNCTION public.generate_tracking_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN 'tk_' || replace(gen_random_uuid()::text, '-', '');
END;
$$;

-- Test the new function
SELECT generate_tracking_id();