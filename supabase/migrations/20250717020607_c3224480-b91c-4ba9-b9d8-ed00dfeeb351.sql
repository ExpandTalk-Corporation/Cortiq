-- Fix the increment_heatmap_intensity function to remove reference to non-existent updated_at column
CREATE OR REPLACE FUNCTION public.increment_heatmap_intensity(p_site_id uuid, p_url text, p_device_type text, p_x integer, p_y integer, p_type text, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.heatmap_data 
  SET intensity = intensity + 1
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