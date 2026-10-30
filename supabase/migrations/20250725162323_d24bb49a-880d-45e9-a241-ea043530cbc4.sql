-- Skapa tabell för cookie-definitioner
CREATE TABLE public.cookie_definitions (
  id SERIAL PRIMARY KEY,
  cookie_name TEXT NOT NULL,
  provider_name TEXT,
  category_key TEXT NOT NULL,
  detection_method TEXT NOT NULL DEFAULT 'exact',
  detection_confidence TEXT NOT NULL DEFAULT 'high',
  purpose TEXT,
  description TEXT,
  expiry TEXT,
  data_stored TEXT,
  security_level TEXT,
  size_bytes INTEGER,
  path TEXT DEFAULT '/',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Skapa index för snabbare sökningar
CREATE INDEX idx_cookie_definitions_name ON public.cookie_definitions(cookie_name);
CREATE INDEX idx_cookie_definitions_category ON public.cookie_definitions(category_key);
CREATE INDEX idx_cookie_definitions_provider ON public.cookie_definitions(provider_name);

-- Aktivera RLS
ALTER TABLE public.cookie_definitions ENABLE ROW LEVEL SECURITY;

-- Skapa policy för läsning (alla kan läsa cookie-definitioner)
CREATE POLICY "Cookie definitions are publicly readable" 
ON public.cookie_definitions 
FOR SELECT 
USING (true);

-- Lägg till trigger för updated_at
CREATE TRIGGER update_cookie_definitions_updated_at
  BEFORE UPDATE ON public.cookie_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Importera cookie-data
INSERT INTO public.cookie_definitions (
  id, cookie_name, provider_name, category_key, detection_method, 
  detection_confidence, purpose, description, expiry, data_stored, 
  security_level, size_bytes, path, is_active, created_at, updated_at
) VALUES 
(1, 'cookiePreferences', 'Google Tag Manager', 'nödvändig', 'exact', 'high', 'Registers cookie preferences of a user', 'Registers cookie preferences of a user', '2 years', 'User preferences/settings', 'Low', 5, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(2, 'td', 'Google Tag Manager', 'analys', 'exact', 'high', 'Registers statistical data on users behaviour (analytics)', 'Registers statistical data on users behaviour on the website. Used for internal analytics by the website operator.', 'Session', 'Usage activity data', 'Medium', 4, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(3, '_ga', 'Google Analytics', 'analys', 'exact', 'high', 'Distinguishes unique users for analytics', 'ID used to identify users for analytics.', '2 years', 'Unique identifier', 'Medium', 30, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(4, '_gali', 'Google Analytics', 'analys', 'exact', 'high', 'Determines which links on a page are clicked', 'Used by Google Analytics to determine which links on a page are being clicked.', '30 seconds', 'Usage activity data', 'Medium', 5, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(5, '_ga_*', 'Google Analytics', 'analys', 'pattern', 'high', 'Distinguishes unique users (Google Analytics 4)', 'ID used to identify users (Google Analytics 4).', '2 years', 'Unique identifier', 'Medium', 30, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(6, '_gid', 'Google Analytics', 'analys', 'exact', 'high', 'Distinguishes users for 24 hours', 'ID used to identify users for 24 hours after last activity.', '24 hours', 'Unique identifier', 'Medium', 20, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(7, '_gat', 'Google Analytics', 'analys', 'exact', 'high', 'Throttles Google Analytics request rate', 'Used to throttle the request rate to Google Analytics servers on high-traffic sites.', '1 minute', 'Usage count', 'Medium', 5, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(8, '_dc_gtm_*', 'Google Tag Manager', 'analys', 'prefix', 'high', 'Throttles Google Analytics requests (via GTM)', 'Used to monitor the number of Google Analytics server requests when using Google Tag Manager.', '1 minute', 'Usage count', 'Medium', 5, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(9, 'AMP_TOKEN', 'Google Analytics', 'analys', 'exact', 'high', 'Links AMP user ID with Google Analytics', 'Contains a token to identify a Client ID from AMP Client ID service, enabling linking user IDs between AMP and non-AMP content.', '30 seconds to 1 year', 'Unique identifier', 'Medium', 10, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(10, '_gat_gtag_*', 'Google Analytics', 'analys', 'prefix', 'high', 'Stores and tracks conversions (Google Analytics)', 'Used to set and get tracking data for Google Analytics via Google Tag (gtag.js).', '1 hour', 'Usage activity data', 'Medium', 10, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(11, '_gac_*', 'Google Analytics', 'marknadsföring', 'pattern', 'high', 'Contains campaign information for Google Ads', 'Contains information related to marketing campaigns of the user. Shared with Google Ads when Google Ads and Analytics are linked together.', '90 days', 'Campaign info', 'High', 20, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(12, '__utma', 'Google Analytics (Classic)', 'analys', 'exact', 'high', 'Distinguishes users and sessions (Classic GA)', 'Used to distinguish users and sessions (Google Analytics Classic). Updated with each page view.', '2 years', 'Unique identifier, timestamps', 'Medium', 36, '/', false, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(13, '__utmz', 'Google Analytics (Classic)', 'analys', 'exact', 'high', 'Stores the traffic source that explains how the user reached the site', 'Contains information about the traffic source or campaign that directed the user to the site. It is updated when data is sent to Google Analytics.', '6 months', 'Referrer and campaign info', 'Medium', 50, '/', false, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(14, '__utmb', 'Google Analytics (Classic)', 'analys', 'exact', 'high', 'Determines new sessions/visits (Classic GA)', 'Used to determine new sessions/visits in Google Analytics (Classic). Set when GA script loads if no existing __utmb, updated on each hit.', '30 minutes', 'Session identifier', 'Medium', 20, '/', false, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(15, '__utmc', 'Google Analytics (Classic)', 'analys', 'exact', 'high', 'Compatability cookie for determining session (Classic GA)', 'Used only by older Google Analytics (urchin.js). Not used in GA.js. It was used to distinguish sessions (deprecated).', 'Session', 'N/A', 'Medium', 5, '/', false, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(16, '__utmv', 'Google Analytics (Classic)', 'analys', 'exact', 'high', 'Stores custom variable data (Classic GA)', 'Contains user-defined custom variable data set by the website admin in Google Analytics (Classic).', '2 years', 'Custom analytics data', 'Medium', 30, '/', false, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(17, '__utmx', 'Google Analytics (Optimize)', 'analys', 'exact', 'high', 'Determines inclusion in A/B test', 'Used to determine whether a user is included in an A/B or multivariate test (Google Optimize).', '18 months', 'Test group identifier', 'Medium', 20, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(18, '__utmxx', 'Google Analytics (Optimize)', 'analys', 'exact', 'high', 'Determines end of A/B test', 'Used to determine when the A/B or multivariate test in which the user participates ends (Google Optimize).', '18 months', 'Test status', 'Medium', 20, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(19, 'FPAU', 'Google Analytics', 'analys', 'exact', 'high', 'Assigns a specific ID to the visitor (GA)', 'Assigns a specific ID to the visitor. Allows determining the number of visits for analysis and statistics.', 'Session', 'Unique identifier', 'Medium', 20, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(20, 'FPID', 'Google Analytics 4', 'analys', 'exact', 'high', 'New GA4 first-party identifier for analytics', 'Registers statistical data on users behaviour on the website (GA4). Similar to _ga.', 'Session', 'Unique identifier', 'Medium', 30, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(21, 'FPLC', 'Google Analytics 4', 'analys', 'exact', 'high', 'GA4 cross-domain linker cookie (hash of FPID)', 'GA4 cross-domain linker cookie, hashed from the FPID cookie. Used to link user sessions across domains.', 'Session', 'Unique identifier (hashed)', 'Medium', 30, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(22, 'CookieConsent', 'Cookiebot', 'funktionell', 'exact', 'high', 'Stores the users cookie consent state', 'Stores the users cookie consent state for the current domain.', '1 year', 'Consent choice', 'Low', 20, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(23, 'CookieConsentBulkTicket', 'Cookiebot', 'funktionell', 'exact', 'high', 'Enables sharing cookie preferences across domains', 'Enables sharing cookie preferences across domains/websites.', '1 year', 'Consent choice', 'Low', 20, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(24, 'userlang', 'Cookiebot', 'funktionell', 'pattern', 'high', 'Saves language preferences of user', 'Saves language preferences of user for a website.', '1 year', 'Language preference', 'Low', 5, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00'),
(25, 'consentUUID', 'Cookiebot', 'funktionell', 'exact', 'high', 'Unique ID for users who accepted consent', 'This cookie is used as a unique identification for the users who have accepted the cookie consent box.', '1 year', 'Unique identifier', 'Low', 36, '/', true, '2025-06-23 08:40:27.662227+00', '2025-06-23 08:40:27.662227+00');