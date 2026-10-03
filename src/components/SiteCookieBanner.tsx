import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cookie, Shield, Settings, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useGoogleConsentMode } from '@/hooks/useGoogleConsentMode';

interface ConsentTypes {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}

export function SiteCookieBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [consent, setConsent] = useState<ConsentTypes>({
    necessary: true,
    analytics: false,
    marketing: false,
    preferences: false
  });

  const { updateConsent } = useGoogleConsentMode();

  useEffect(() => {
    // The site's privacy choice must remain available without a tracking tag.
    // A cookieless analytics flag does not authorize other optional technologies.
    try {
      const existingConsent = localStorage.getItem('site_cookie_consent');
      if (existingConsent) {
        const parsed = JSON.parse(existingConsent);
        if (parsed && Date.parse(parsed.expiresAt) > Date.now() &&
            ['analytics', 'marketing', 'preferences'].every(key => typeof parsed[key] === 'boolean')) {
          setConsent(parsed);
          updateConsent(parsed);
          return;
        }
      }
    } catch { /* Missing/corrupt/blocked storage requires a new choice. */ }
    const timer = setTimeout(() => setShowBanner(true), 1000);
    return () => clearTimeout(timer);
  }, []); // Cookie banner should always be available regardless of auth state

  const initializeAnalytics = (consentTypes: ConsentTypes) => {
    if (consentTypes.analytics && window.gtag) {
      // Initialize Google Analytics if consent given
      window.gtag('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: consentTypes.marketing ? 'granted' : 'denied'
      });
    }
  };

  const saveConsent = (consentTypes: ConsentTypes) => {
    setConsent(consentTypes);
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    try { localStorage.setItem('site_cookie_consent', JSON.stringify({ ...consentTypes, expiresAt })); }
    catch { /* Apply the choice for this page even when storage is blocked. */ }
    
    // Set cookie for server-side detection
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `site_consent=${JSON.stringify(consentTypes)}; expires=${expires.toUTCString()}; path=/; secure; samesite=strict`;
    
    // Initialize analytics
    initializeAnalytics(consentTypes);
    
    // Update Google Consent Mode v2
    updateConsent(consentTypes);
    
    // Dispatch custom event for tracking (includes e-commerce consent)
    window.dispatchEvent(new CustomEvent('siteConsentUpdated', { 
      detail: {
        ...consentTypes,
        ecommerce: consentTypes.marketing, // E-commerce requires marketing consent
        timestamp: Date.now()
      } 
    }));
    
    // Store consent for edge functions
    if (window.sessionStorage) {
      sessionStorage.setItem('user_consent', JSON.stringify({
        analytics: consentTypes.analytics,
        marketing: consentTypes.marketing,
        preferences: consentTypes.preferences,
        ecommerce: consentTypes.marketing,
        granted: true,
        timestamp: Date.now()
      }));
    }
    
    setShowBanner(false);
    setShowSettings(false);
  };

  const handleAcceptAll = () => {
    saveConsent({
      necessary: true,
      analytics: true,
      marketing: true,
      preferences: true
    });
  };

  const handleRejectAll = () => {
    saveConsent({
      necessary: true,
      analytics: false,
      marketing: false,
      preferences: false
    });
  };

  const handleSaveSettings = () => {
    saveConsent(consent);
  };

  if (!showBanner) return (
    <Button variant="outline" className="fixed bottom-3 right-3 z-50" onClick={() => setShowBanner(true)}>
      Cookie settings
    </Button>
  );

  const storageRow = (name: string, detail: string) => (
    <div key={name} className="font-mono bg-muted px-2 py-1 rounded flex justify-between gap-3">
      <span>{name}</span>
      <span className="text-green-600 text-right">{detail}</span>
    </div>
  );

  const noneSet = (
    <p className="text-xs text-muted-foreground italic">
      cortiq.se currently sets no cookies or storage in this category.
    </p>
  );

  return (
    <>
      {/* Main Cookie Banner */}
      <div
        className="fixed bottom-0 left-0 right-0 p-4 transition-transform duration-500 ease-out z-[var(--z-cookie-banner,9999)]"
        style={{
          transform: showBanner ? 'translateY(0)' : 'translateY(100%)',
          contain: 'layout style',
          willChange: 'transform'
        }}
      >
        <Card className="mx-auto max-w-5xl border-2 bg-card shadow-elegant border-primary/30 shadow-2xl">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center">
                  <Cookie className="h-6 w-6 text-white" />
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-lg font-bold">Your privacy choices</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    You decide whether cortiq.se may use optional cookies and storage for analytics, marketing
                    and preferences. You can change your choice at any time via Cookie settings.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                  <Button
                    onClick={handleAcceptAll}
                    variant="outline"
                    className="text-sm px-6 py-3 h-auto font-semibold"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Accept all
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleRejectAll}
                    className="text-sm px-6 py-3 h-auto font-semibold"
                  >
                    Necessary only
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={() => setShowBanner(false)}
                    className="text-sm px-4 py-2 h-auto text-muted-foreground"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Settings link below banner */}
        <div className="text-center mt-3">
          <button
            onClick={() => setShowSettings(true)}
            className="text-primary hover:underline text-sm bg-background/90 px-3 py-1 rounded-md"
          >
            <Settings className="h-4 w-4 mr-1 inline" />
            Customize settings
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Cookie className="h-5 w-5 text-primary" />
              Cookie settings for cortiq.se
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                <strong>What this website stores:</strong> the list below is everything cortiq.se itself sets in
                your browser. All items are first-party. cortiq.se does not load Google Analytics or other
                third-party tracking.
              </p>
            </div>

            <div className="space-y-4">
              {/* Necessary */}
              <div className="border rounded-lg p-4 bg-muted/20">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    checked={consent.necessary}
                    disabled
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">Necessary</h4>
                      <Badge variant="secondary" className="text-xs">Always active</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Required for the website to work. Stores your privacy choices, your theme choice and, if you
                      log in, your session.
                    </p>
                    <div className="space-y-1 text-xs">
                      {storageRow('site_cookie_consent', 'localStorage • 12 months')}
                      {storageRow('site_consent', 'Cookie • 12 months')}
                      {storageRow('user_consent', 'sessionStorage • Tab session')}
                      {storageRow('theme', 'localStorage • Only if you switch theme')}
                      {storageRow('sb-…-auth-token', 'localStorage • Only when logged in')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Analytics */}
              <div className="border rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    checked={consent.analytics}
                    onCheckedChange={(checked) =>
                      setConsent(prev => ({ ...prev, analytics: !!checked }))
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">Analytics</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Measuring how the website is used, so we can improve it.
                    </p>
                    {noneSet}
                  </div>
                </div>
              </div>

              {/* Marketing */}
              <div className="border rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    checked={consent.marketing}
                    onCheckedChange={(checked) =>
                      setConsent(prev => ({ ...prev, marketing: !!checked }))
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">Marketing</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Advertising measurement and conversion tracking.
                    </p>
                    {noneSet}
                  </div>
                </div>
              </div>

              {/* Preferences */}
              <div className="border rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    checked={consent.preferences}
                    onCheckedChange={(checked) =>
                      setConsent(prev => ({ ...prev, preferences: !!checked }))
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">Preferences</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Remembering optional settings for a more personal experience.
                    </p>
                    {noneSet}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowSettings(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveSettings} className="bg-gradient-primary">
                Save settings
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
