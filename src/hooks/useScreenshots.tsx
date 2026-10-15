import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ScreenshotData {
  url: string;
  filename: string;
  timestamp: string;
  viewport_width: number;
  viewport_height: number;
  placeholder?: boolean;
}

export interface SiteScreenshots {
  [url: string]: {
    [deviceType: string]: ScreenshotData;
  };
}

export function useScreenshots() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const takeScreenshot = async (url: string, siteId: string, deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop') => {
    console.log('takeScreenshot called:', { url, siteId, deviceType });
    setLoading(true);
    
    try {
      console.log('Invoking take-screenshot function...');
      const { data, error } = await supabase.functions.invoke('take-screenshot', {
        body: {
          url,
          siteId,
          deviceType
        }
      });

      if (error) {
        // Non-2xx: surface the function's own reason (e.g. Browserless failure) instead of
        // the generic "Edge Function returned a non-2xx status code".
        let reason = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) reason = body.error;
        } catch { /* keep generic message */ }
        throw new Error(reason);
      }

      console.log('Screenshot function response:', data);

      toast({
        title: "Screenshot taken",
        description: `Screenshot of ${url} has been saved`,
      });

      return data;
    } catch (error) {
      console.error('Screenshot error:', error);
      toast({
        variant: "destructive",
        title: "Screenshot error",
        description: error.message || "Could not take a screenshot of the page",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getScreenshots = async (siteId: string): Promise<SiteScreenshots> => {
    try {
      const { data, error } = await supabase
        .from('sites')
        .select('screenshot_urls')
        .eq('id', siteId)
        .single();

      if (error) throw error;

      // Type-safe handling of the JSONB data with proper sanitization
      const screenshotUrls = data?.screenshot_urls;
      if (typeof screenshotUrls === 'object' && screenshotUrls !== null && !Array.isArray(screenshotUrls)) {
        // Deep clone and sanitize the data to prevent circular references
        const sanitizedData = JSON.parse(JSON.stringify(screenshotUrls));
        return sanitizedData as SiteScreenshots;
      }
      
      return {};
    } catch (error) {
      console.error('Get screenshots error:', error);
      return {};
    }
  };

  const getScreenshotForPage = (screenshots: SiteScreenshots, url: string, deviceType: string = 'desktop'): ScreenshotData | null => {
    // Requested device type, then 'all', then 'desktop'. Placeholder SVGs saved by the old
    // screenshot function are not screenshots: skip them so the UI offers "Take screenshot".
    const urlData = screenshots[url];
    if (!urlData) return null;
    for (const key of [deviceType, 'all', 'desktop']) {
      const shot = urlData[key];
      if (shot && !shot.placeholder) return shot;
    }
    return null;
  };

  return {
    takeScreenshot,
    getScreenshots,
    getScreenshotForPage,
    loading
  };
}