-- Create form analytics tables
CREATE TABLE IF NOT EXISTS public.form_analytics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL,
    form_id TEXT NOT NULL,
    form_name TEXT,
    form_type TEXT NOT NULL, -- 'contact_form_7', 'gravity_forms', 'woocommerce_checkout', 'custom'
    total_starts INTEGER DEFAULT 0,
    total_completions INTEGER DEFAULT 0,
    total_abandons INTEGER DEFAULT 0,
    avg_completion_time INTEGER DEFAULT 0, -- in seconds
    conversion_rate DECIMAL(5,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.form_field_analytics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL,
    form_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    field_type TEXT, -- 'text', 'email', 'tel', 'select', 'checkbox', 'radio', 'textarea'
    field_label TEXT,
    field_position INTEGER, -- order in form
    total_interactions INTEGER DEFAULT 0,
    total_errors INTEGER DEFAULT 0,
    total_skips INTEGER DEFAULT 0,
    avg_focus_time INTEGER DEFAULT 0, -- in milliseconds
    error_rate DECIMAL(5,2) DEFAULT 0.00,
    skip_rate DECIMAL(5,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.form_sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL,
    session_id TEXT NOT NULL,
    form_id TEXT NOT NULL,
    form_type TEXT NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    abandoned_at TIMESTAMP WITH TIME ZONE,
    completion_time INTEGER, -- in seconds
    fields_completed INTEGER DEFAULT 0,
    total_fields INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    device_type TEXT,
    user_agent TEXT,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.form_field_interactions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL,
    session_id TEXT NOT NULL,
    form_session_id UUID,
    form_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    interaction_type TEXT NOT NULL, -- 'focus', 'blur', 'input', 'error', 'skip'
    interaction_value TEXT, -- error message, input value hash, etc.
    focus_time INTEGER, -- time spent focused on field in ms
    field_position INTEGER,
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.form_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_field_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_field_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can create form analytics" ON public.form_analytics FOR INSERT WITH CHECK (true);
CREATE POLICY "Site owners can view form analytics" ON public.form_analytics FOR SELECT 
USING (EXISTS (SELECT 1 FROM sites WHERE sites.id = form_analytics.site_id AND sites.user_id = auth.uid()));

CREATE POLICY "Anyone can create form field analytics" ON public.form_field_analytics FOR INSERT WITH CHECK (true);
CREATE POLICY "Site owners can view form field analytics" ON public.form_field_analytics FOR SELECT 
USING (EXISTS (SELECT 1 FROM sites WHERE sites.id = form_field_analytics.site_id AND sites.user_id = auth.uid()));

CREATE POLICY "Anyone can create form sessions" ON public.form_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Site owners can view form sessions" ON public.form_sessions FOR SELECT 
USING (EXISTS (SELECT 1 FROM sites WHERE sites.id = form_sessions.site_id AND sites.user_id = auth.uid()));

CREATE POLICY "Anyone can create form field interactions" ON public.form_field_interactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Site owners can view form field interactions" ON public.form_field_interactions FOR SELECT 
USING (EXISTS (SELECT 1 FROM sites WHERE sites.id = form_field_interactions.site_id AND sites.user_id = auth.uid()));

-- Indexes for performance
CREATE INDEX idx_form_analytics_site_id ON public.form_analytics(site_id);
CREATE INDEX idx_form_field_analytics_site_form ON public.form_field_analytics(site_id, form_id);
CREATE INDEX idx_form_sessions_site_form ON public.form_sessions(site_id, form_id);
CREATE INDEX idx_form_field_interactions_session ON public.form_field_interactions(session_id);

-- Update triggers
CREATE TRIGGER update_form_analytics_updated_at
    BEFORE UPDATE ON public.form_analytics
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_field_analytics_updated_at
    BEFORE UPDATE ON public.form_field_analytics
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();