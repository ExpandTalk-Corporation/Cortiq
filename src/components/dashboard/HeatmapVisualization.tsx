import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Flame, BarChart3, Zap, Monitor, Smartphone, Tablet, TrendingDown, Eye, Camera, RefreshCw, Upload } from 'lucide-react';
import { useScreenshots, type SiteScreenshots } from '@/hooks/useScreenshots';
import { supabase } from '@/integrations/supabase/client';

// Use the shared type from dashboard.ts
import type { HeatmapPoint } from '@/types/dashboard';

interface HeatmapVisualizationProps {
  heatmapData: HeatmapPoint[];
  selectedUrl: string;
  loading?: boolean;
  filters?: {
    deviceType?: string;
    days?: number;
    interactionType?: string;
  };
  pageTitle?: string;
  siteId?: string;
}

export function HeatmapVisualization({ 
  heatmapData, 
  selectedUrl, 
  loading,
  filters,
  pageTitle,
  siteId
}: HeatmapVisualizationProps) {
  const [viewMode, setViewMode] = useState<'heatmap' | 'points'>('heatmap');
  const [screenshots, setScreenshots] = useState<SiteScreenshots>({});
  const [isUploading, setIsUploading] = useState(false);
  const { takeScreenshot, getScreenshots, getScreenshotForPage, loading: screenshotLoading } = useScreenshots();

  useEffect(() => {
    if (siteId) {
      loadScreenshots();
    }
  }, [siteId, selectedUrl, filters?.deviceType]); // Add selectedUrl and deviceType as dependencies

  const loadScreenshots = async () => {
    if (!siteId) return;
    console.log('Loading screenshots for siteId:', siteId);
    const screenshotData = await getScreenshots(siteId);
    console.log('Loaded screenshot data:', screenshotData);
    setScreenshots(screenshotData);
  };

  const handleTakeScreenshot = async () => {
    if (!selectedUrl || !siteId) {
      console.error('Missing selectedUrl or siteId:', { selectedUrl, siteId });
      return;
    }
    
    console.log('Taking screenshot:', { selectedUrl, siteId, deviceType: filters?.deviceType || 'desktop' });
    
    try {
      const result = await takeScreenshot(selectedUrl, siteId, filters?.deviceType as any || 'desktop');
      console.log('Screenshot result:', result);
      await loadScreenshots(); // Reload screenshots after taking new one
    } catch (error) {
      console.error('Failed to take screenshot:', error);
    }
  };

  const handleUploadScreenshot = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedUrl || !siteId) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setIsUploading(true);

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${siteId}/${selectedUrl.replace(/[^a-zA-Z0-9]/g, '_')}_${filters?.deviceType || 'all'}_${Date.now()}.${fileExt}`;
      
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('page-screenshots')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('page-screenshots')
        .getPublicUrl(fileName);

      // Update screenshot_urls in database
      const deviceType = filters?.deviceType || 'all';
      const newScreenshotData = {
        ...screenshots,
        [selectedUrl]: {
          ...screenshots[selectedUrl],
          [deviceType]: {
            url: publicUrl,
            filename: fileName,
            timestamp: new Date().toISOString(),
            viewport_width: deviceType === 'mobile' ? 375 : deviceType === 'tablet' ? 768 : 1920,
            viewport_height: deviceType === 'mobile' ? 667 : deviceType === 'tablet' ? 1024 : 1080,
            uploaded: true
          }
        }
      };

      const { error: updateError } = await supabase
        .from('sites')
        .update({ screenshot_urls: newScreenshotData as any })
        .eq('id', siteId);

      if (updateError) throw updateError;

      // Update local state
      setScreenshots(newScreenshotData);
      
      // Success message
      alert('Screenshot uploaded!');
      
    } catch (error) {
      console.error('Error uploading screenshot:', error);
      alert('Error uploading screenshot');
    } finally {
      setIsUploading(false);
      // Clear file input
      event.target.value = '';
    }
  };

  const currentScreenshot = getScreenshotForPage(screenshots, selectedUrl, filters?.deviceType || 'desktop');
  const validScreenshot = currentScreenshot;
  
  // Above the fold line (responsive based on device type)
  const getFoldLine = (deviceType: string) => {
    switch (deviceType) {
      case 'mobile': return 600;  // Mobile fold line
      case 'tablet': return 700;  // Tablet fold line  
      case 'desktop': return 800; // Desktop fold line (increased from 600)
      default: return 800;
    }
  };

  const getViewportSize = (deviceType: string) => {
    switch (deviceType?.toLowerCase()) {
      case 'mobile': return { width: 375, height: 667 };
      case 'tablet': return { width: 768, height: 1024 };
      case 'desktop': return { width: 1920, height: 1080 };
      default: return { width: 1920, height: 1080 };
    }
  };

  const FOLD_LINE = getFoldLine(filters?.deviceType || 'desktop');
  
  const getIntensityColor = (intensity: number, maxIntensity: number) => {
    const ratio = intensity / maxIntensity;
    if (ratio > 0.8) return 'bg-red-600 shadow-red-500/50';
    if (ratio > 0.6) return 'bg-red-500 shadow-red-400/40';
    if (ratio > 0.4) return 'bg-orange-500 shadow-orange-400/40';
    if (ratio > 0.2) return 'bg-yellow-500 shadow-yellow-400/30';
    return 'bg-blue-500 shadow-blue-400/30';
  };

  const getHeatmapGradient = (intensity: number, maxIntensity: number) => {
    const ratio = intensity / maxIntensity;
    const opacity = Math.min(ratio * 0.9 + 0.3, 1);
    
    if (ratio > 0.8) return `rgba(220, 38, 38, ${opacity})`;
    if (ratio > 0.6) return `rgba(239, 68, 68, ${opacity})`;
    if (ratio > 0.4) return `rgba(249, 115, 22, ${opacity})`;
    if (ratio > 0.2) return `rgba(234, 179, 8, ${opacity})`;
    return `rgba(59, 130, 246, ${opacity})`;
  };

  const getGlowEffect = (intensity: number, maxIntensity: number) => {
    const ratio = intensity / maxIntensity;
    if (ratio > 0.8) return 'shadow-lg shadow-red-500/60';
    if (ratio > 0.6) return 'shadow-md shadow-red-400/50';
    if (ratio > 0.4) return 'shadow-md shadow-orange-400/50';
    return 'shadow-sm shadow-blue-400/30';
  };

  const maxIntensity = Math.max(...heatmapData.map(p => p.intensity), 1);
  const totalInteractions = heatmapData.reduce((sum, point) => sum + point.intensity, 0);
  
  // Above/below the fold statistics (fixed calculation)
  const aboveFoldInteractions = heatmapData.filter(p => {
    const yCoord = p.grid_y !== undefined ? 
      (p.grid_y / 50) * getViewportSize(filters?.deviceType || 'desktop').height : // Use correct viewport height
      (p.y_coordinate || 0);
    return yCoord < FOLD_LINE;
  }).reduce((sum, point) => sum + point.intensity, 0);
  
  const belowFoldInteractions = heatmapData.filter(p => {
    const yCoord = p.grid_y !== undefined ? 
      (p.grid_y / 50) * getViewportSize(filters?.deviceType || 'desktop').height : // Use correct viewport height
      (p.y_coordinate || 0);
    return yCoord >= FOLD_LINE;
  }).reduce((sum, point) => sum + point.intensity, 0);
  
  const aboveFoldPercentage = totalInteractions > 0 ? Math.round((aboveFoldInteractions / totalInteractions) * 100) : 0;
  const belowFoldPercentage = totalInteractions > 0 ? Math.round((belowFoldInteractions / totalInteractions) * 100) : 0;

  const getInteractionTypeIcon = (type: string) => {
    switch (type) {
      case 'click': return '🖱️';
      case 'scroll': return '📜';
      case 'mousemove': return '🖱️';
      default: return '👆';
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType?.toLowerCase()) {
      case 'mobile': return <Smartphone className="h-4 w-4" />;
      case 'tablet': return <Tablet className="h-4 w-4" />;
      case 'desktop': return <Monitor className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };


  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Heatmap Visualization
          </CardTitle>
          <CardDescription>Loading heatmap data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Flame className="h-6 w-6 text-red-500" />
              Heatmap Visualization
            </CardTitle>
            <div className="mt-2 space-y-1">
              {pageTitle && (
                <div className="text-lg font-semibold text-foreground">
                  {pageTitle}
                </div>
              )}
              <div className="text-sm text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
                {selectedUrl}
              </div>
              <CardDescription>
                Showing {filters?.interactionType === 'all' ? 'all interactions' : filters?.interactionType || 'clicks'}
                {filters?.deviceType && filters.deviceType !== 'all' && (
                  <span className="inline-flex items-center gap-1 ml-2">
                    {getDeviceIcon(filters.deviceType)}
                    {filters.deviceType}
                  </span>
                )}
                {' '}on this page. Each dot is a cluster of interactions at that position; warmer colours
                mean more interactions. The dashed line marks the fold for the selected device, so
                anything below it was only reached by visitors who scrolled. Positions are laid over a
                screenshot of the page, so take or update the screenshot after a redesign. Data comes from
                the CortIQ tracking script and is recorded only for visitors who accepted analytics cookies.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleTakeScreenshot}
              disabled={screenshotLoading || !siteId}
            >
              {screenshotLoading ? (
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Camera className="h-4 w-4 mr-1" />
              )}
              {currentScreenshot ? 'Update screenshot' : 'Take screenshot'}
            </Button>
            
            <div className="flex flex-col gap-2">
              <div className="flex items-center">
                <label htmlFor="screenshot-upload" className="cursor-pointer">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!selectedUrl || isUploading || !siteId}
                    asChild
                  >
                    <span>
                      {isUploading ? (
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      {isUploading ? 'Uploading...' : 'Upload screenshot'}
                    </span>
                  </Button>
                </label>
                <input
                  id="screenshot-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleUploadScreenshot}
                  className="hidden"
                />
              </div>
              {(() => {
                const deviceType = filters?.deviceType || 'desktop';
                const getRecommendedSize = () => {
                  switch (deviceType) {
                    case 'mobile': return '375×667px (or similar mobile format)';
                    case 'tablet': return '768×1024px (or similar tablet format)';
                    case 'desktop': return '1920×1080px (or larger)';
                    default: return '1920×1080px (or larger)';
                  }
                };
                return (
                  <p className="text-xs text-muted-foreground">
                    Recommended size: {getRecommendedSize()}
                  </p>
                );
              })()}
            </div>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => window.open(selectedUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open page
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              <div>
                <div className="text-sm font-medium">{heatmapData.length}</div>
                <div className="text-xs text-muted-foreground">Points</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Zap className="h-4 w-4 text-orange-500" />
              <div>
                <div className="text-sm font-medium">{totalInteractions}</div>
                <div className="text-xs text-muted-foreground">Interactions</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Flame className="h-4 w-4 text-red-500" />
              <div>
                <div className="text-sm font-medium">{maxIntensity}</div>
                <div className="text-xs text-muted-foreground">Max intensity</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Eye className="h-4 w-4 text-green-600" />
              <div>
                <div className="text-sm font-medium text-green-800">{aboveFoldPercentage}%</div>
                <div className="text-xs text-green-600">Above fold</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <TrendingDown className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-sm font-medium text-blue-800">{belowFoldPercentage}%</div>
                <div className="text-xs text-blue-600">Below fold</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <div className="text-sm font-medium">{filters?.days || 7}</div>
              <div className="text-xs text-muted-foreground">Days</div>
            </div>
          </div>

          {/* View Mode Tabs */}
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as any)}>
            <TabsList>
              <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
              <TabsTrigger value="points">Points</TabsTrigger>
            </TabsList>

            <TabsContent value="heatmap" className="mt-4">
              <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border-2 border-dashed border-gray-200 min-h-[800px] overflow-hidden">
                {/* Browser-like header */}
                <div className="bg-gray-200 px-4 py-2 border-b flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                    <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                    <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  </div>
                  <div className="text-xs text-gray-600 bg-white px-2 py-1 rounded flex-1 truncate">
                    {selectedUrl}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {getDeviceIcon(filters?.deviceType || 'desktop')}
                    <span>{getViewportSize(filters?.deviceType || 'desktop').width}px × {getViewportSize(filters?.deviceType || 'desktop').height}px</span>
                  </div>
                </div>

                {/* Heatmap content area */}
                <div className="relative min-h-[750px]">
                  {/* Above the fold area */}
                  <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-green-50/30 to-green-100/20 border-b-2 border-green-200 border-dashed" 
                       style={{ height: `${FOLD_LINE}px` }}>
                    <div className="absolute top-2 left-4 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded shadow z-20">
                      Above the fold ({aboveFoldPercentage}%)
                    </div>
                  </div>
                  
                  {/* Below the fold area */}
                  <div className="absolute inset-x-0 bg-gradient-to-b from-blue-50/20 to-blue-100/10"
                       style={{ top: `${FOLD_LINE}px`, bottom: 0 }}>
                    <div className="absolute top-2 left-4 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded shadow z-20">
                      Below the fold ({belowFoldPercentage}%)
                    </div>
                  </div>
                  
                  {/* Attention decay gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-900/5 to-gray-900/20 pointer-events-none"></div>
                  
                  {/* Fold line */}
                  <div className="absolute inset-x-0 border-t-2 border-dashed border-gray-400 z-10"
                       style={{ top: `${FOLD_LINE}px` }}>
                     <div className="absolute -top-3 right-4 text-xs font-medium text-gray-600 bg-white px-2 py-1 rounded shadow">
                       The Fold ({FOLD_LINE}px)
                     </div>
                  </div>
                  
                  <div className="p-4 min-h-[750px] relative">
                    {/* Website Preview Background with screenshot or fallback */}
                    <div className="absolute inset-4 bg-white rounded border overflow-hidden">
                      {validScreenshot ? (
                        <div className="relative w-full h-full">
                          <img
                            src={currentScreenshot.url}
                            alt="Website screenshot"
                            className="w-full h-full object-cover object-top"
                            style={{
                              imageRendering: 'crisp-edges'
                            }}
                          />
                          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            {new Date(currentScreenshot.timestamp).toLocaleDateString('sv-SE')}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 bg-gray-50">
                          <Camera className="h-12 w-12 mb-4 text-gray-400" />
                          <h3 className="text-lg font-medium mb-2">No screenshot available</h3>
                          <p className="text-sm text-center max-w-md mb-4">
                            Take a screenshot of this page to see the heatmap overlaid on the actual design.
                          </p>
                          <Button 
                            onClick={handleTakeScreenshot}
                            disabled={screenshotLoading || !siteId}
                            size="sm"
                          >
                            {screenshotLoading ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                Taking screenshot...
                              </>
                            ) : (
                              <>
                                <Camera className="h-4 w-4 mr-2" />
                                Take screenshot
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    
                     {heatmapData.length === 0 && (
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-30 bg-black/50 backdrop-blur-sm">
                         <div className="bg-white/90 rounded-lg p-6 max-w-md">
                           <div className="text-4xl mb-4">🔍</div>
                           <h3 className="text-lg font-medium text-gray-800 mb-2">No heatmap data yet</h3>
                           <p className="text-sm text-gray-600">
                             No {filters?.interactionType === 'all' ? 'interaction' : filters?.interactionType || 'click'} data was recorded for this page in the selected period.
                           </p>
                           <ul className="mt-4 text-xs text-gray-600 text-left list-disc pl-5 space-y-1">
                             <li>Install the CortIQ tracking script or the WordPress plugin on the site (Setup tab).</li>
                             <li>Heatmap data is recorded only for visitors who accept analytics cookies.</li>
                             <li>Pick a page with traffic above, or widen the period in the filters below.</li>
                           </ul>
                         </div>
                       </div>
                     )}
                     
                     {heatmapData.length > 0 && (
                       <>
                         {/* Heatmap gradient overlay */}
                         <div className="absolute inset-0 pointer-events-none z-20">
                           {heatmapData.map((point, index) => {
                             // Scale coordinates based on screenshot viewport vs actual viewport
                             const screenshot = currentScreenshot;
                             const scaleX = screenshot ? (screenshot.viewport_width / 1920) : 1;
                             const scaleY = screenshot ? (screenshot.viewport_height / 1080) : 1;
                             
                             // Handle both grid and legacy coordinate systems
                               let leftPercent, topPercent;
                                
                                if (point.grid_x !== null && point.grid_y !== null && point.grid_x !== undefined && point.grid_y !== undefined) {
                                  // New grid system: each grid cell is 2% of screen (50x50 = 100%)
                                  leftPercent = (point.grid_x * 2);
                                  topPercent = (point.grid_y * 2);
                                  
                                  console.log(`Grid point: (${point.grid_x}, ${point.grid_y}) -> (${leftPercent}%, ${topPercent}%)`);
                                } else {
                                  // Legacy coordinate system: konvertera pixlar till procent
                                  const viewportWidth = point.viewport_width || 1920;
                                  const viewportHeight = point.viewport_height || 1080;
                                  
                                  leftPercent = Math.min(Math.max(((point.x_coordinate || 0) / viewportWidth) * 100, 0), 98);
                                  topPercent = Math.min(Math.max(((point.y_coordinate || 0) / viewportHeight) * 100, 0), 98);
                                  
                                  console.log(`Legacy point: (${point.x_coordinate}, ${point.y_coordinate}) viewport:(${viewportWidth}x${viewportHeight}) -> (${leftPercent}%, ${topPercent}%)`);
                                }

                              return (
                                <div
                                  key={`heatmap-${index}`}
                                  className="absolute"
                                  style={{
                                    left: `${leftPercent}%`,
                                    top: `${topPercent}%`,
                                    width: '2%', // Fixed grid cell size 
                                    height: '2%', // Fixed grid cell size
                                    backgroundColor: getHeatmapGradient(point.intensity, maxIntensity),
                                    transform: 'translate(-50%, -50%)',
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    opacity: 0.7
                                  }}
                                />
                             );
                           })}
                         </div>

                         {/* Interaction points with enhanced styling */}
                         {heatmapData.map((point, index) => {
                           // Scale coordinates based on screenshot viewport vs actual viewport
                           const screenshot = currentScreenshot;
                           const scaleX = screenshot ? (screenshot.viewport_width / 1920) : 1;
                           const scaleY = screenshot ? (screenshot.viewport_height / 1080) : 1;
                           
                               // Handle both grid and legacy coordinate systems
                                let leftPercent, topPercent, xCoord, yCoord;
                                
                                if (point.grid_x !== null && point.grid_y !== null && point.grid_x !== undefined && point.grid_y !== undefined) {
                                  // New grid system: fyrkantiga grid-celler
                                  leftPercent = (point.grid_x * 2);
                                  topPercent = (point.grid_y * 2);
                                  xCoord = Math.round((point.grid_x * 2) * (point.viewport_width || 1920) / 100);
                                  yCoord = Math.round((point.grid_y * 2) * (point.viewport_height || 1080) / 100);
                                } else {
                                  // Legacy coordinate system: konvertera pixlar till procent
                                  const viewportWidth = point.viewport_width || 1920;
                                  const viewportHeight = point.viewport_height || 1080;
                                  
                                  leftPercent = Math.min(Math.max(((point.x_coordinate || 0) / viewportWidth) * 100, 0), 98);
                                  topPercent = Math.min(Math.max(((point.y_coordinate || 0) / viewportHeight) * 100, 0), 98);
                                  xCoord = point.x_coordinate || 0;
                                  yCoord = point.y_coordinate || 0;
                                 leftPercent = Math.min(Math.max((point.x_coordinate || 0) / 10, 0), 95);
                                 topPercent = Math.min(Math.max((point.y_coordinate || 0) / 10, 0), 90);
                                 xCoord = point.x_coordinate || 0;
                                 yCoord = point.y_coordinate || 0;
                               }

                              return (
                                <div
                                  key={`point-${index}`}
                                  className={`absolute border-2 border-white cursor-pointer hover:scale-110 transition-all duration-200 z-30 ${getIntensityColor(point.intensity, maxIntensity)}`}
                                  style={{
                                    left: `${leftPercent}%`,
                                    top: `${topPercent}%`,
                                    width: '2%', // Fyrkantiga grid-celler 
                                    height: '2%', // Fyrkantiga grid-celler
                                    transform: 'translate(-50%, -50%)',
                                    borderRadius: point.grid_x !== undefined ? '2px' : '50%', // Fyrkanter för grid, cirklar för legacy
                                    boxShadow: `0 0 ${Math.min(point.intensity * 2 + 4, 20)}px ${getHeatmapGradient(point.intensity, maxIntensity)}50`
                                  }}
                                  title={`${getInteractionTypeIcon(point.interaction_type)} ${point.intensity} ${point.interaction_type}s på (${xCoord}, ${yCoord}) • ${yCoord < FOLD_LINE ? 'Above fold' : 'Below fold'} ${point.grid_x !== undefined ? ' • Grid(' + point.grid_x + ',' + point.grid_y + ')' : ' • Legacy'}`}
                                />
                             );
                         })}
                       </>
                     )}
                     
                     {!validScreenshot && heatmapData.length === 0 && (
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-30 bg-white/90 backdrop-blur-sm">
                         <Camera className="h-12 w-12 mb-4 text-gray-400" />
                         <h3 className="text-lg font-medium text-gray-600 mb-2">Screenshot needed</h3>
                         <p className="text-sm text-gray-500 max-w-md mb-4">
                           Take a screenshot of this page to visualize the heatmap data on the actual design.
                         </p>
                         <Button 
                           onClick={handleTakeScreenshot}
                           disabled={screenshotLoading || !siteId}
                           size="sm"
                         >
                           {screenshotLoading ? (
                             <>
                               <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                               Taking screenshot...
                             </>
                           ) : (
                             <>
                               <Camera className="h-4 w-4 mr-2" />
                               Take screenshot
                             </>
                           )}
                         </Button>
                       </div>
                     )}
                   </div>
                 </div>
               </div>
             </TabsContent>

            <TabsContent value="points" className="mt-4">
              <div className="space-y-4">
                {heatmapData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No data to display
                  </div>
                ) : (
                  <div className="grid gap-2 max-h-[400px] overflow-y-auto">
                    {heatmapData.slice(0, 50).map((point, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full ${getIntensityColor(point.intensity, maxIntensity)}`}></div>
                          <div>
                            <div className="text-sm font-medium">
                              {getInteractionTypeIcon(point.interaction_type)} {point.interaction_type}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {point.grid_x !== undefined && point.grid_y !== undefined ? (
                                <>Grid: ({point.grid_x}, {point.grid_y}) • GDPR-safe</>
                              ) : (
                                <>Position: ({point.x_coordinate || 0}, {point.y_coordinate || 0}) • Legacy</>
                              )}
                              {point.device_type && ` • ${point.device_type}`}
                               <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                                 (point.grid_y !== undefined ? 
                                   (point.grid_y / 50) * getViewportSize(filters?.deviceType || 'desktop').height : 
                                   (point.y_coordinate || 0)) < FOLD_LINE
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                 {(point.grid_y !== undefined ? 
                                   (point.grid_y / 50) * getViewportSize(filters?.deviceType || 'desktop').height : 
                                   (point.y_coordinate || 0)) < FOLD_LINE ? 'Above fold' : 'Below fold'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {point.intensity}x
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Enhanced Legend */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Intensity:</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded-full shadow-sm"></div>
                  <span className="text-xs">Low (1-20%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-500 rounded-full shadow-sm"></div>
                  <span className="text-xs">Medium (21-40%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-orange-500 rounded-full shadow-md shadow-orange-400/50"></div>
                  <span className="text-xs">High (41-60%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 rounded-full shadow-md shadow-red-400/50"></div>
                  <span className="text-xs">Very high (61-80%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-600 rounded-full shadow-lg shadow-red-500/60"></div>
                  <span className="text-xs">Extremely high (81-100%)</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Zones:</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 border border-green-200 rounded"></div>
                  <span className="text-xs">Above the fold (0-600px)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-100 border border-blue-200 rounded"></div>
                  <span className="text-xs">Below the fold (600px+)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gradient-to-b from-transparent to-gray-300 rounded"></div>
                  <span className="text-xs">Attention decreases downward</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}