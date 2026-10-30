-- Lägg till saknade kolumner för bättre kategorisering
ALTER TABLE heatmap_data ADD COLUMN IF NOT EXISTS element_text TEXT;
ALTER TABLE heatmap_data ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE heatmap_data ADD COLUMN IF NOT EXISTS element_selector TEXT;
ALTER TABLE heatmap_data ADD COLUMN IF NOT EXISTS form_name TEXT;
ALTER TABLE heatmap_data ADD COLUMN IF NOT EXISTS parent_form_id TEXT;

-- Lägg till konverteringsspårning till sites
ALTER TABLE sites ADD COLUMN IF NOT EXISTS conversion_goals JSONB DEFAULT '[]'::jsonb;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS navigation_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS form_tracking_config JSONB DEFAULT '{}'::jsonb;

-- Lägg till konverteringsspårning till page_views
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS is_conversion_page BOOLEAN DEFAULT FALSE;

-- Skapa en tabell för att spåra konverteringsmål
CREATE TABLE IF NOT EXISTS conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  session_id UUID,
  page_view_id UUID,
  event_type TEXT NOT NULL, -- 'form_submission', 'button_click', 'page_visit', 'phone_click' etc
  event_name TEXT NOT NULL, -- 'Contact Form', 'Quote Request', 'Call Button' etc
  event_value DECIMAL(10,2), -- optional value för e-commerce
  element_selector TEXT,
  form_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS på conversion_events
ALTER TABLE conversion_events ENABLE ROW LEVEL SECURITY;

-- Policy för conversion_events
CREATE POLICY "Site owners can view conversion events" 
ON conversion_events 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM sites 
  WHERE sites.id = conversion_events.site_id 
  AND sites.user_id = auth.uid()
));

CREATE POLICY "Anyone can create conversion events" 
ON conversion_events 
FOR INSERT 
WITH CHECK (true);

-- Lägg till index för prestanda
CREATE INDEX IF NOT EXISTS idx_conversion_events_site_id ON conversion_events(site_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_created_at ON conversion_events(created_at);
CREATE INDEX IF NOT EXISTS idx_heatmap_data_interaction_type ON heatmap_data(interaction_type);
CREATE INDEX IF NOT EXISTS idx_heatmap_data_element_text ON heatmap_data(element_text);

-- Uppdatera en exempelsite med konfiguration
UPDATE sites 
SET 
  conversion_goals = '[
    {
      "id": "contact_form",
      "name": "Kontaktformulär",
      "type": "form_submission",
      "selector": "form[name=\"contact\"], #contact-form, .contact-form",
      "value": 50
    },
    {
      "id": "phone_click", 
      "name": "Telefonklick",
      "type": "element_click",
      "selector": "a[href^=\"tel:\"], .phone-link, .call-button",
      "value": 25
    },
    {
      "id": "quote_request",
      "name": "Offertförfrågan", 
      "type": "form_submission",
      "selector": "form[name=\"quote\"], #quote-form",
      "value": 100
    }
  ]'::jsonb,
  navigation_config = '{
    "main_menu_selectors": ["nav", ".main-nav", "#navigation", ".navbar"],
    "footer_selectors": ["footer", ".footer", "#footer"],
    "breadcrumb_selectors": [".breadcrumb", ".breadcrumbs", "#breadcrumbs"]
  }'::jsonb,
  form_tracking_config = '{
    "contact_forms": ["#contact-form", "form[name=\"contact\"]", ".contact-form"],
    "newsletter_forms": ["#newsletter", ".newsletter-signup", "form[name=\"newsletter\"]"],
    "quote_forms": ["#quote-form", "form[name=\"quote\"]", ".quote-form"]
  }'::jsonb
WHERE domain LIKE '%itskerhet%' OR domain LIKE '%expandtalk%';