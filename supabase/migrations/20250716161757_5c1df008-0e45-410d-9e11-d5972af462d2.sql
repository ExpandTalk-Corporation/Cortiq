-- Security fixes for database functions
-- Add SECURITY DEFINER and SET search_path to prevent privilege escalation

-- Fix generate_tracking_id function
CREATE OR REPLACE FUNCTION public.generate_tracking_id()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  RETURN 'tk_' || encode(gen_random_bytes(16), 'hex');
END;
$function$;

-- Fix set_tracking_id function
CREATE OR REPLACE FUNCTION public.set_tracking_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  IF NEW.tracking_id IS NULL OR NEW.tracking_id = '' THEN
    NEW.tracking_id = public.generate_tracking_id();
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix increment_heatmap_intensity function
CREATE OR REPLACE FUNCTION public.increment_heatmap_intensity(
  p_site_id uuid,
  p_url text,
  p_device_type text,
  p_x integer,
  p_y integer,
  p_type text,
  p_date date
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  UPDATE public.heatmap_data 
  SET intensity = intensity + 1,
      updated_at = now()
  WHERE site_id = p_site_id 
    AND url = p_url 
    AND device_type = p_device_type 
    AND x_coordinate = p_x 
    AND y_coordinate = p_y 
    AND interaction_type = p_type 
    AND date = p_date;
    
  -- If no row was updated, insert a new one
  IF NOT FOUND THEN
    INSERT INTO public.heatmap_data (
      site_id, url, device_type, x_coordinate, y_coordinate, 
      interaction_type, intensity, date
    ) VALUES (
      p_site_id, p_url, p_device_type, p_x, p_y, p_type, 1, p_date
    ) ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$function$;