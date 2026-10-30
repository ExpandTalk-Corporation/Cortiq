-- First check what RLS policies exist for tracking_sessions
SELECT tablename, policyname, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'tracking_sessions';

-- Check if RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'tracking_sessions';