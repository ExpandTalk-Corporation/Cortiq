-- Create table for detected cookies and scripts on websites
CREATE TABLE public.detected_cookies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL,
    cookie_name TEXT NOT NULL,
    cookie_domain TEXT,
    cookie_category TEXT NOT NULL CHECK (cookie_category IN ('necessary', 'analytics', 'marketing', 'preferences')),
    cookie_purpose TEXT,
    cookie_provider TEXT,
    cookie_expiry TEXT,
    is_third_party BOOLEAN DEFAULT false,
    detection_method TEXT DEFAULT 'automatic', -- 'automatic', 'manual', 'plugin_scan'
    plugin_name TEXT, -- If detected via plugin scan
    script_source TEXT, -- URL or source of the script that sets this cookie
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(site_id, cookie_name, cookie_domain)
);

-- Create table for plugin/script detection
CREATE TABLE public.detected_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL,
    script_name TEXT NOT NULL,
    script_type TEXT NOT NULL, -- 'plugin', 'external_script', 'inline_script'
    script_url TEXT,
    detected_cookies TEXT[], -- Array of cookie names this script sets
    category TEXT NOT NULL CHECK (category IN ('necessary', 'analytics', 'marketing', 'preferences')),
    provider TEXT,
    purpose TEXT,
    is_active BOOLEAN DEFAULT true,
    detection_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(site_id, script_name, script_url)
);

-- Enable RLS
ALTER TABLE public.detected_cookies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_scripts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for detected_cookies
CREATE POLICY "Site owners can manage detected cookies"
ON public.detected_cookies
FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.sites 
    WHERE sites.id = detected_cookies.site_id 
    AND sites.user_id = auth.uid()
))
WITH CHECK (EXISTS (
    SELECT 1 FROM public.sites 
    WHERE sites.id = detected_cookies.site_id 
    AND sites.user_id = auth.uid()
));

CREATE POLICY "Anyone can insert detected cookies"
ON public.detected_cookies
FOR INSERT
WITH CHECK (true);

-- RLS Policies for detected_scripts  
CREATE POLICY "Site owners can manage detected scripts"
ON public.detected_scripts
FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.sites 
    WHERE sites.id = detected_scripts.site_id 
    AND sites.user_id = auth.uid()
))
WITH CHECK (EXISTS (
    SELECT 1 FROM public.sites 
    WHERE sites.id = detected_scripts.site_id 
    AND sites.user_id = auth.uid()
));

CREATE POLICY "Anyone can insert detected scripts"
ON public.detected_scripts
FOR INSERT
WITH CHECK (true);

-- Create function to get site cookie summary
CREATE OR REPLACE FUNCTION public.get_site_cookie_summary(p_site_id UUID)
RETURNS TABLE (
    category TEXT,
    cookie_count BIGINT,
    script_count BIGINT
) 
LANGUAGE SQL
SECURITY DEFINER
AS $$
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
$$;

-- Add triggers for updated_at
CREATE TRIGGER update_detected_cookies_updated_at
    BEFORE UPDATE ON public.detected_cookies
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add cookie scanning settings to sites table
ALTER TABLE public.sites 
ADD COLUMN IF NOT EXISTS cookie_scanning_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_categorize_cookies BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_cookie_scan TIMESTAMP WITH TIME ZONE;