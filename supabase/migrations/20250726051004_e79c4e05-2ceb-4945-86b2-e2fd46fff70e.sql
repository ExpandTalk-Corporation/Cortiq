-- Lägg till svenska kolumner i cookie_definitions tabellen (om de inte redan finns)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cookie_definitions' AND column_name = 'description_sv') THEN
        ALTER TABLE public.cookie_definitions ADD COLUMN description_sv text;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cookie_definitions' AND column_name = 'purpose_sv') THEN
        ALTER TABLE public.cookie_definitions ADD COLUMN purpose_sv text;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cookie_definitions' AND column_name = 'provider_name_sv') THEN
        ALTER TABLE public.cookie_definitions ADD COLUMN provider_name_sv text;
    END IF;
END $$;

-- Uppdatera befintliga definitioner med svenska översättningar
UPDATE public.cookie_definitions 
SET 
  description_sv = CASE cookie_name
    WHEN '_ga' THEN 'Används för att särskilja användare i Google Analytics'
    WHEN '_ga_*' THEN 'Används för att begränsa datainsamlingshastigheten i Google Analytics'
    WHEN '_gid' THEN 'Används för att särskilja användare under 24 timmar i Google Analytics'
    WHEN '_gat' THEN 'Används för att begränsa förfrågningshastigheten i Google Analytics'
    WHEN 'gtag' THEN 'Används för att läsa ut andra Google Analytics cookies'
    WHEN '_fbp' THEN 'Används av Facebook för annonsering och spårning'
    WHEN '_fbc' THEN 'Lagrar och spårar besök över webbplatser för Facebook-annonsering'
    WHEN 'fr' THEN 'Facebook cookie för annonsering och användarspårning'
    ELSE description
  END,
  purpose_sv = CASE cookie_name
    WHEN '_ga' THEN 'Webbanalys och användarspårning'
    WHEN '_ga_*' THEN 'Hastighetsbegränsning för datasamling'
    WHEN '_gid' THEN 'Daglig användaridentifiering'
    WHEN '_gat' THEN 'Begränsa API-anrop till Google Analytics'
    WHEN 'gtag' THEN 'Konfiguration av Google Analytics'
    WHEN '_fbp' THEN 'Facebook Pixel spårning'
    WHEN '_fbc' THEN 'Facebook konverteringsspårning'
    WHEN 'fr' THEN 'Facebook användaridentifiering'
    ELSE purpose
  END,
  provider_name_sv = CASE 
    WHEN provider_name = 'Google Analytics' THEN 'Google Analytics'
    WHEN provider_name = 'Facebook' THEN 'Facebook'
    WHEN provider_name = 'WordPress' THEN 'WordPress'
    ELSE provider_name
  END
WHERE description_sv IS NULL OR purpose_sv IS NULL;

-- Lägg till system-cookies för GDPR-hantering (om de inte redan finns)
INSERT INTO public.cookie_definitions (
  cookie_name, provider_name, provider_name_sv, category_key, 
  detection_method, detection_confidence, purpose, purpose_sv, 
  description, description_sv, expiry, data_stored, security_level
) 
SELECT 
  'gdpr_consent', 'Heatmap Analytics', 'Heatmap Analytics', 'nödvändig',
  'exact', 'high', 
  'Stores user cookie consent preferences for GDPR compliance',
  'Lagrar användarens cookie-samtycke för GDPR-efterlevnad',
  'Essential cookie that remembers your cookie preferences and consent choices',
  'Nödvändig cookie som kommer ihåg dina cookie-inställningar och samtycke',
  '1 år', 'consent preferences (boolean values)', 'secure'
WHERE NOT EXISTS (SELECT 1 FROM public.cookie_definitions WHERE cookie_name = 'gdpr_consent');

INSERT INTO public.cookie_definitions (
  cookie_name, provider_name, provider_name_sv, category_key,
  detection_method, detection_confidence, purpose, purpose_sv,
  description, description_sv, expiry, data_stored, security_level
) 
SELECT
  'analytics_session', 'Heatmap Analytics', 'Heatmap Analytics', 'analys',
  'exact', 'high',
  'Session tracking for website analytics',
  'Sessionshantering för webbanalys', 
  'Tracks user session for analytics purposes when consent is given',
  'Spårar användarsession för analyser när samtycke givits',
  'session', 'session ID', 'secure'
WHERE NOT EXISTS (SELECT 1 FROM public.cookie_definitions WHERE cookie_name = 'analytics_session');

INSERT INTO public.cookie_definitions (
  cookie_name, provider_name, provider_name_sv, category_key,
  detection_method, detection_confidence, purpose, purpose_sv,
  description, description_sv, expiry, data_stored, security_level
) 
SELECT
  'marketing_tracking', 'Heatmap Analytics', 'Heatmap Analytics', 'marknadsföring',
  'exact', 'high',
  'Marketing and advertising tracking',
  'Marknadsföring och reklamspårning',
  'Enables marketing analytics and advertising personalization',
  'Möjliggör marknadsföringsanalys och personaliserad reklam', 
  '30 dagar', 'marketing preferences', 'secure'
WHERE NOT EXISTS (SELECT 1 FROM public.cookie_definitions WHERE cookie_name = 'marketing_tracking');

INSERT INTO public.cookie_definitions (
  cookie_name, provider_name, provider_name_sv, category_key,
  detection_method, detection_confidence, purpose, purpose_sv,
  description, description_sv, expiry, data_stored, security_level
) 
SELECT
  'functional_prefs', 'Heatmap Analytics', 'Heatmap Analytics', 'funktionell',
  'exact', 'high',
  'Functional preferences and personalization',
  'Funktionella inställningar och personalisering',
  'Stores user preferences for website functionality',
  'Lagrar användarens inställningar för webbplatsens funktionalitet',
  '6 månader', 'user preferences', 'secure'
WHERE NOT EXISTS (SELECT 1 FROM public.cookie_definitions WHERE cookie_name = 'functional_prefs');

-- Lägg till vanliga WordPress system-cookies
INSERT INTO public.cookie_definitions (
  cookie_name, provider_name, provider_name_sv, category_key,
  detection_method, detection_confidence, purpose, purpose_sv,
  description, description_sv, expiry, data_stored, security_level
) 
SELECT
  'PHPSESSID', 'WordPress', 'WordPress', 'nödvändig',
  'exact', 'high',
  'PHP session management', 
  'PHP-sessionshantering',
  'Essential cookie for maintaining user session in WordPress',
  'Nödvändig cookie för att upprätthålla användarsession i WordPress',
  'session', 'session data', 'secure'
WHERE NOT EXISTS (SELECT 1 FROM public.cookie_definitions WHERE cookie_name = 'PHPSESSID');

INSERT INTO public.cookie_definitions (
  cookie_name, provider_name, provider_name_sv, category_key,
  detection_method, detection_confidence, purpose, purpose_sv,
  description, description_sv, expiry, data_stored, security_level
) 
SELECT
  'wordpress_*', 'WordPress', 'WordPress', 'nödvändig', 
  'pattern', 'high',
  'WordPress authentication and functionality',
  'WordPress-autentisering och funktionalitet',
  'Required cookies for WordPress login and admin functionality',
  'Nödvändiga cookies för WordPress-inloggning och adminfunktioner',
  'varies', 'authentication data', 'secure'
WHERE NOT EXISTS (SELECT 1 FROM public.cookie_definitions WHERE cookie_name = 'wordpress_*');

INSERT INTO public.cookie_definitions (
  cookie_name, provider_name, provider_name_sv, category_key,
  detection_method, detection_confidence, purpose, purpose_sv,
  description, description_sv, expiry, data_stored, security_level
) 
SELECT
  'wp-settings-*', 'WordPress', 'WordPress', 'funktionell',
  'pattern', 'medium', 
  'WordPress user interface preferences',
  'WordPress användarsnittsinställningar',
  'Stores WordPress admin interface customizations',
  'Lagrar anpassningar av WordPress administrationsgränssnitt',
  '1 år', 'UI preferences', 'secure'
WHERE NOT EXISTS (SELECT 1 FROM public.cookie_definitions WHERE cookie_name = 'wp-settings-*');