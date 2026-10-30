-- Add Google Analytics integration fields to sites table
ALTER TABLE public.sites 
ADD COLUMN ga_measurement_id TEXT,
ADD COLUMN ga_integration_enabled BOOLEAN DEFAULT false,
ADD COLUMN ga_sync_events TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN ga_enhanced_ecommerce BOOLEAN DEFAULT false;