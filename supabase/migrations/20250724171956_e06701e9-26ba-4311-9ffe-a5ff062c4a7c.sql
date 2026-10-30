-- Förbättra cookie_consents tabellen med föreslagna tillägg
ALTER TABLE public.cookie_consents 
ADD COLUMN IF NOT EXISTS user_agent text,
ADD COLUMN IF NOT EXISTS geo_country text,
ADD COLUMN IF NOT EXISTS source text DEFAULT 'banner',
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Lägg till trigger för updated_at
CREATE TRIGGER update_cookie_consents_updated_at
  BEFORE UPDATE ON public.cookie_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Skapa index för bättre prestanda
CREATE INDEX IF NOT EXISTS idx_cookie_consents_site_session ON public.cookie_consents(site_id, session_id);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_created_at ON public.cookie_consents(created_at);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_expires_at ON public.cookie_consents(expires_at);