-- GDPR Compliance Tables

-- Cookie consent tracking
CREATE TABLE public.cookie_consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  site_id UUID NOT NULL,
  consent_given BOOLEAN NOT NULL DEFAULT false,
  consent_types JSONB NOT NULL DEFAULT '{"necessary": true, "analytics": false, "marketing": false}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '1 year')
);

-- User data requests (export/deletion)
CREATE TABLE public.data_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL,
  email TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('export', 'deletion', 'portability')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  request_data JSONB,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 days')
);

-- GDPR settings per site
CREATE TABLE public.gdpr_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL UNIQUE,
  cookie_consent_enabled BOOLEAN NOT NULL DEFAULT true,
  data_retention_days INTEGER NOT NULL DEFAULT 365,
  anonymize_ip BOOLEAN NOT NULL DEFAULT true,
  privacy_policy_url TEXT,
  contact_email TEXT,
  dpo_email TEXT,
  legal_basis JSONB NOT NULL DEFAULT '{"analytics": "consent", "necessary": "legitimate_interest"}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cookie_consents
CREATE POLICY "Anyone can create cookie consents" 
ON public.cookie_consents 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Site owners can view cookie consents" 
ON public.cookie_consents 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM sites 
  WHERE sites.id = cookie_consents.site_id 
  AND sites.user_id = auth.uid()
));

-- RLS Policies for data_requests
CREATE POLICY "Anyone can create data requests" 
ON public.data_requests 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Site owners can view data requests" 
ON public.data_requests 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM sites 
  WHERE sites.id = data_requests.site_id 
  AND sites.user_id = auth.uid()
));

CREATE POLICY "Site owners can update data requests" 
ON public.data_requests 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM sites 
  WHERE sites.id = data_requests.site_id 
  AND sites.user_id = auth.uid()
));

-- RLS Policies for gdpr_settings
CREATE POLICY "Site owners can manage GDPR settings" 
ON public.gdpr_settings 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM sites 
  WHERE sites.id = gdpr_settings.site_id 
  AND sites.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM sites 
  WHERE sites.id = gdpr_settings.site_id 
  AND sites.user_id = auth.uid()
));

-- Triggers for updated_at
CREATE TRIGGER update_gdpr_settings_updated_at
BEFORE UPDATE ON public.gdpr_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Data retention function
CREATE OR REPLACE FUNCTION public.cleanup_old_tracking_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  site_record RECORD;
  retention_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Loop through all sites and their retention settings
  FOR site_record IN 
    SELECT s.id as site_id, COALESCE(g.data_retention_days, 365) as retention_days
    FROM public.sites s
    LEFT JOIN public.gdpr_settings g ON s.id = g.site_id
  LOOP
    retention_date := now() - (site_record.retention_days || ' days')::interval;
    
    -- Delete old tracking data
    DELETE FROM public.heatmap_data 
    WHERE site_id = site_record.site_id 
    AND created_at < retention_date;
    
    DELETE FROM public.tracking_sessions 
    WHERE site_id = site_record.site_id 
    AND started_at < retention_date;
    
    DELETE FROM public.form_sessions 
    WHERE site_id = site_record.site_id 
    AND created_at < retention_date;
    
    DELETE FROM public.page_views 
    WHERE site_id = site_record.site_id 
    AND viewed_at < retention_date;
  END LOOP;
  
  -- Clean up expired cookie consents
  DELETE FROM public.cookie_consents WHERE expires_at < now();
  
  -- Clean up expired data requests
  DELETE FROM public.data_requests WHERE expires_at < now();
END;
$$;

-- Function to anonymize IP addresses
CREATE OR REPLACE FUNCTION public.anonymize_ip(ip_address TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
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
$$;