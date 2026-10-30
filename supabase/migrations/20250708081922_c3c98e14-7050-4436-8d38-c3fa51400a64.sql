-- Create tables for pixel tracking system

-- Sites table (customer websites)
CREATE TABLE public.sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  domain TEXT NOT NULL,
  site_name TEXT NOT NULL,
  tracking_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Tracking sessions (user visits)
CREATE TABLE public.tracking_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  referrer TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  viewport_width INTEGER,
  viewport_height INTEGER,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  page_views INTEGER DEFAULT 1,
  duration_seconds INTEGER DEFAULT 0
);

-- Page views
CREATE TABLE public.page_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.tracking_sessions(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  time_on_page INTEGER DEFAULT 0,
  scroll_depth INTEGER DEFAULT 0,
  exit_page BOOLEAN DEFAULT false
);

-- User interactions (clicks, hovers, scrolls)
CREATE TABLE public.user_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.tracking_sessions(id) ON DELETE CASCADE,
  page_view_id UUID NOT NULL REFERENCES public.page_views(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL, -- 'click', 'scroll', 'hover', 'focus'
  element_tag TEXT,
  element_id TEXT,
  element_class TEXT,
  element_text TEXT,
  x_coordinate INTEGER,
  y_coordinate INTEGER,
  scroll_position INTEGER,
  timestamp_ms BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Heatmap data aggregation
CREATE TABLE public.heatmap_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  device_type TEXT NOT NULL,
  x_coordinate INTEGER NOT NULL,
  y_coordinate INTEGER NOT NULL,
  interaction_type TEXT NOT NULL,
  intensity INTEGER DEFAULT 1,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heatmap_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sites
CREATE POLICY "Users can view their own sites" 
ON public.sites 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sites" 
ON public.sites 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sites" 
ON public.sites 
FOR UPDATE 
USING (auth.uid() = user_id);

-- RLS Policies for tracking data (readable by site owners, insertable by anyone with valid site_id)
CREATE POLICY "Site owners can view tracking sessions" 
ON public.tracking_sessions 
FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.sites WHERE sites.id = tracking_sessions.site_id AND sites.user_id = auth.uid()));

CREATE POLICY "Anyone can create tracking sessions" 
ON public.tracking_sessions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Site owners can view page views" 
ON public.page_views 
FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.sites WHERE sites.id = page_views.site_id AND sites.user_id = auth.uid()));

CREATE POLICY "Anyone can create page views" 
ON public.page_views 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Site owners can view user interactions" 
ON public.user_interactions 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.page_views 
  JOIN public.sites ON sites.id = page_views.site_id 
  WHERE page_views.id = user_interactions.page_view_id 
  AND sites.user_id = auth.uid()
));

CREATE POLICY "Anyone can create user interactions" 
ON public.user_interactions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Site owners can view heatmap data" 
ON public.heatmap_data 
FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.sites WHERE sites.id = heatmap_data.site_id AND sites.user_id = auth.uid()));

CREATE POLICY "Anyone can create heatmap data" 
ON public.heatmap_data 
FOR INSERT 
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_tracking_sessions_site_id ON public.tracking_sessions(site_id);
CREATE INDEX idx_tracking_sessions_session_id ON public.tracking_sessions(session_id);
CREATE INDEX idx_page_views_session_id ON public.page_views(session_id);
CREATE INDEX idx_page_views_url ON public.page_views(url);
CREATE INDEX idx_user_interactions_session_id ON public.user_interactions(session_id);
CREATE INDEX idx_user_interactions_page_view_id ON public.user_interactions(page_view_id);
CREATE INDEX idx_user_interactions_type ON public.user_interactions(interaction_type);
CREATE INDEX idx_heatmap_data_site_url ON public.heatmap_data(site_id, url);
CREATE INDEX idx_heatmap_data_coordinates ON public.heatmap_data(x_coordinate, y_coordinate);

-- Create function to generate unique tracking IDs
CREATE OR REPLACE FUNCTION generate_tracking_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'tk_' || encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate tracking IDs
CREATE OR REPLACE FUNCTION set_tracking_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tracking_id IS NULL OR NEW.tracking_id = '' THEN
    NEW.tracking_id = generate_tracking_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tracking_id_trigger
  BEFORE INSERT ON public.sites
  FOR EACH ROW
  EXECUTE FUNCTION set_tracking_id();