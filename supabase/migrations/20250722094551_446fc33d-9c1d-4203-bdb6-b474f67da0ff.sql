-- Create A/B testing tables

-- Table for managing A/B tests
CREATE TABLE public.ab_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid NOT NULL,
  test_name text NOT NULL,
  test_description text,
  test_status text NOT NULL DEFAULT 'draft',
  test_type text NOT NULL DEFAULT 'page',
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  traffic_allocation jsonb NOT NULL DEFAULT '{"variant_a": 50, "variant_b": 50}'::jsonb,
  conversion_goal text NOT NULL,
  conversion_metric text NOT NULL DEFAULT 'conversion_rate',
  baseline_value numeric,
  target_lift numeric,
  confidence_level integer NOT NULL DEFAULT 95,
  minimum_sample_size integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- Table for A/B test variants
CREATE TABLE public.ab_test_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id uuid NOT NULL,
  variant_name text NOT NULL,
  variant_description text,
  variant_config jsonb,
  traffic_percentage integer NOT NULL DEFAULT 50,
  is_control boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table for A/B test assignments
CREATE TABLE public.ab_test_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  session_id text NOT NULL,
  user_identifier text,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  site_id uuid NOT NULL
);

-- Table for A/B test results
CREATE TABLE public.ab_test_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  site_id uuid NOT NULL,
  sessions integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  conversion_rate numeric NOT NULL DEFAULT 0.00,
  revenue numeric DEFAULT 0.00,
  statistical_significance numeric,
  confidence_interval_lower numeric,
  confidence_interval_upper numeric,
  p_value numeric,
  calculated_at timestamp with time zone NOT NULL DEFAULT now(),
  date date NOT NULL DEFAULT CURRENT_DATE
);

-- Enable RLS
ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ab_tests
CREATE POLICY "Site owners can manage AB tests"
ON public.ab_tests
FOR ALL
USING (EXISTS (
  SELECT 1 FROM sites 
  WHERE sites.id = ab_tests.site_id 
  AND sites.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM sites 
  WHERE sites.id = ab_tests.site_id 
  AND sites.user_id = auth.uid()
));

-- RLS Policies for ab_test_variants
CREATE POLICY "Site owners can manage AB test variants"
ON public.ab_test_variants
FOR ALL
USING (EXISTS (
  SELECT 1 FROM ab_tests 
  JOIN sites ON sites.id = ab_tests.site_id
  WHERE ab_tests.id = ab_test_variants.test_id 
  AND sites.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM ab_tests 
  JOIN sites ON sites.id = ab_tests.site_id
  WHERE ab_tests.id = ab_test_variants.test_id 
  AND sites.user_id = auth.uid()
));

-- RLS Policies for ab_test_assignments  
CREATE POLICY "Anyone can create AB test assignments"
ON public.ab_test_assignments
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Site owners can view AB test assignments"
ON public.ab_test_assignments
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM sites 
  WHERE sites.id = ab_test_assignments.site_id 
  AND sites.user_id = auth.uid()
));

-- RLS Policies for ab_test_results
CREATE POLICY "Anyone can create AB test results"
ON public.ab_test_results
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Site owners can view AB test results"
ON public.ab_test_results
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM sites 
  WHERE sites.id = ab_test_results.site_id 
  AND sites.user_id = auth.uid()
));

-- Add foreign key constraints
ALTER TABLE public.ab_test_variants
ADD CONSTRAINT fk_ab_test_variants_test_id
FOREIGN KEY (test_id) REFERENCES public.ab_tests(id) ON DELETE CASCADE;

ALTER TABLE public.ab_test_assignments
ADD CONSTRAINT fk_ab_test_assignments_test_id
FOREIGN KEY (test_id) REFERENCES public.ab_tests(id) ON DELETE CASCADE;

ALTER TABLE public.ab_test_assignments
ADD CONSTRAINT fk_ab_test_assignments_variant_id
FOREIGN KEY (variant_id) REFERENCES public.ab_test_variants(id) ON DELETE CASCADE;

ALTER TABLE public.ab_test_results
ADD CONSTRAINT fk_ab_test_results_test_id
FOREIGN KEY (test_id) REFERENCES public.ab_tests(id) ON DELETE CASCADE;

ALTER TABLE public.ab_test_results
ADD CONSTRAINT fk_ab_test_results_variant_id
FOREIGN KEY (variant_id) REFERENCES public.ab_test_variants(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX idx_ab_tests_site_id ON public.ab_tests(site_id);
CREATE INDEX idx_ab_test_variants_test_id ON public.ab_test_variants(test_id);
CREATE INDEX idx_ab_test_assignments_session_id ON public.ab_test_assignments(session_id);
CREATE INDEX idx_ab_test_assignments_test_id ON public.ab_test_assignments(test_id);
CREATE INDEX idx_ab_test_results_test_id ON public.ab_test_results(test_id);
CREATE INDEX idx_ab_test_results_date ON public.ab_test_results(date);

-- Add trigger for updated_at
CREATE TRIGGER update_ab_tests_updated_at
BEFORE UPDATE ON public.ab_tests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();