-- Create storage bucket for page screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('page-screenshots', 'page-screenshots', true);

-- Add screenshot URL column to sites table
ALTER TABLE public.sites 
ADD COLUMN screenshot_urls JSONB DEFAULT '{}';

-- Create storage policies for page screenshots
CREATE POLICY "Screenshots are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'page-screenshots');

CREATE POLICY "Authenticated users can upload screenshots" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'page-screenshots' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update screenshots" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'page-screenshots' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete screenshots" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'page-screenshots' AND auth.role() = 'authenticated');