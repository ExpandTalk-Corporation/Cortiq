import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Globe, Plus } from 'lucide-react';

interface PageSelectorProps {
  siteId: string;
  selectedPage: string | null;
  onPageChange: (pageUrl: string) => void;
  placeholder?: string;
  /** Pages supplied by the caller (e.g. pages with heatmap data). Skips the page-view lookup. */
  pages?: { url: string; detail: string }[];
}

interface PageData {
  page_url: string;
  page_views: number;
  unique_visitors: number;
}

export function PageSelector({ siteId, selectedPage, onPageChange, placeholder = "Select page to analyze", pages: suppliedPages }: PageSelectorProps) {
  const [pages, setPages] = useState<PageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customUrl, setCustomUrl] = useState('');

  useEffect(() => {
    if (suppliedPages) return;
    if (siteId) {
      loadPages();
    }
  }, [siteId, suppliedPages]);

  const loadPages = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('page_views')
        .select('url')
        .eq('site_id', siteId)
        .order('viewed_at', { ascending: false });

      if (error) throw error;

      // Get unique URLs and create page data
      const uniqueUrls = [...new Set(data.map(item => item.url))];
      const pageData = uniqueUrls.slice(0, 50).map(url => ({
        page_url: url,
        page_views: data.filter(item => item.url === url).length,
        unique_visitors: data.filter(item => item.url === url).length // Simplified for now
      }));

      setPages(pageData);
      
      // If no pages found in database, add option to manually enter URL
      if (pageData.length === 0) {
        setPages([
          { page_url: 'custom-url', page_views: 0, unique_visitors: 0 }
        ]);
      }
    } catch (error) {
      console.error('Error loading pages:', error);
      // Fallback to manual URL input option
      setPages([
        { page_url: 'custom-url', page_views: 0, unique_visitors: 0 }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatPageUrl = (url: string) => {
    if (url === '/') return 'Home';
    
    // Ta bort protokoll och domän, visa bara sökvägen
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      return path.length > 50 ? path.substring(0, 50) + '...' : path;
    } catch {
      return url.length > 50 ? url.substring(0, 50) + '...' : url;
    }
  };

  const handleCustomUrlSubmit = () => {
    if (customUrl.trim()) {
      onPageChange(customUrl.trim());
      setShowCustomInput(false);
      setCustomUrl('');
    }
  };

  const handleSelectChange = (value: string) => {
    if (value === 'custom-url') {
      setShowCustomInput(true);
    } else {
      onPageChange(value);
    }
  };

  if (showCustomInput) {
    return (
      <div className="flex gap-2 w-[300px]">
        <Input
          placeholder="Enter URL (e.g. https://example.com)"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleCustomUrlSubmit()}
          className="flex-1"
        />
        <Button onClick={handleCustomUrlSubmit} disabled={!customUrl.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => setShowCustomInput(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  const options = suppliedPages
    ? [{ page_url: 'custom-url', detail: '' }, ...suppliedPages.map((p) => ({ page_url: p.url, detail: p.detail }))]
    : pages.map((p) => ({ page_url: p.page_url, detail: `${p.page_views} views` }));

  return (
    <Select value={selectedPage || ''} onValueChange={handleSelectChange} disabled={isLoading}>
      <SelectTrigger className="w-[300px]">
        <SelectValue placeholder={isLoading ? "Loading pages..." : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.some(p => p.page_url === 'custom-url') && (
          <SelectItem value="custom-url">
            <div className="flex items-center gap-2 min-w-0">
              <Plus className="h-4 w-4 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Enter URL manually</p>
                <p className="text-xs text-muted-foreground">
                  To take a screenshot of any page
                </p>
              </div>
            </div>
          </SelectItem>
        )}
        {options.filter(p => p.page_url !== 'custom-url').map((page) => (
          <SelectItem key={page.page_url} value={page.page_url}>
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="h-4 w-4 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{formatPageUrl(page.page_url)}</p>
                <p className="text-xs text-muted-foreground">
                  {page.detail}
                </p>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}