-- Check if we need to add a unique constraint for the heatmap_data table
-- The increment_heatmap_intensity function tries to use ON CONFLICT, but there's no unique constraint

-- Create a unique constraint on the combination of fields that should be unique
ALTER TABLE public.heatmap_data 
ADD CONSTRAINT heatmap_data_unique_location 
UNIQUE (site_id, url, device_type, x_coordinate, y_coordinate, interaction_type, date);