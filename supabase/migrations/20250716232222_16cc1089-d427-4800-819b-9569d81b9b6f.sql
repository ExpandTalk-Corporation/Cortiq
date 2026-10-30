-- Add IP exclusion columns to sites table
ALTER TABLE public.sites 
ADD COLUMN excluded_ips TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN ip_exclusion_enabled BOOLEAN DEFAULT true;