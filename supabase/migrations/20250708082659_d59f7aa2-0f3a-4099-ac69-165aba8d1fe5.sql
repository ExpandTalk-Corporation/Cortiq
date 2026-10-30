-- Create function to increment heatmap intensity
CREATE OR REPLACE FUNCTION increment_heatmap_intensity(
  p_site_id UUID,
  p_url TEXT,
  p_device_type TEXT,
  p_x INTEGER,
  p_y INTEGER,
  p_type TEXT,
  p_date DATE
)
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql;