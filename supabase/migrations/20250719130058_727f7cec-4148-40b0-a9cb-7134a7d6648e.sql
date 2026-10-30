-- Fix security warnings by adding search_path to functions
-- This prevents SQL injection via search path manipulation

-- Update validate_email function
CREATE OR REPLACE FUNCTION public.validate_email(email_input text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Basic email validation regex
  RETURN email_input ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
END;
$function$;

-- Update update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Update anonymize_ip function
CREATE OR REPLACE FUNCTION public.anonymize_ip(ip_address text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = ''
AS $function$
BEGIN
  IF ip_address IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- IPv4 anonymization (mask last octet)
  IF ip_address ~* '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN
    RETURN regexp_replace(ip_address, '\.[0-9]{1,3}$', '.0');
  END IF;
  
  -- IPv6 anonymization (mask last 80 bits)
  IF ip_address ~* '^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$' THEN
    RETURN regexp_replace(ip_address, ':[0-9a-f]{0,4}:[0-9a-f]{0,4}:[0-9a-f]{0,4}:[0-9a-f]{0,4}$', '::0');
  END IF;
  
  -- Return original if format not recognized
  RETURN ip_address;
END;
$function$;

-- Update get_site_cookie_summary function
CREATE OR REPLACE FUNCTION public.get_site_cookie_summary(p_site_id uuid)
 RETURNS TABLE(category text, cookie_count bigint, script_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
    SELECT 
        dc.cookie_category as category,
        COUNT(DISTINCT dc.id) as cookie_count,
        COUNT(DISTINCT ds.id) as script_count
    FROM public.detected_cookies dc
    FULL OUTER JOIN public.detected_scripts ds ON dc.site_id = ds.site_id AND dc.cookie_category = ds.category
    WHERE (dc.site_id = p_site_id OR ds.site_id = p_site_id)
    GROUP BY dc.cookie_category
    ORDER BY 
        CASE dc.cookie_category 
            WHEN 'necessary' THEN 1
            WHEN 'analytics' THEN 2  
            WHEN 'marketing' THEN 3
            WHEN 'preferences' THEN 4
        END;
$function$;