-- Add RLS policies for tracking_sessions to allow site owners to view their data
CREATE POLICY "Site owners can view tracking sessions" 
ON public.tracking_sessions 
FOR SELECT 
USING (EXISTS (
  SELECT 1 
  FROM sites 
  WHERE sites.id = tracking_sessions.site_id 
  AND sites.user_id = auth.uid()
));

-- Add similar policies for page_views to ensure complete analytics
CREATE POLICY "Site owners can view page views" 
ON public.page_views 
FOR SELECT 
USING (EXISTS (
  SELECT 1 
  FROM sites 
  WHERE sites.id = page_views.site_id 
  AND sites.user_id = auth.uid()
));