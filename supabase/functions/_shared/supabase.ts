// The one supabase-js version for every Edge Function. Import createClient / SupabaseClient
// from here, never from a URL: tests/foundation/supabase-js-pin.test.mjs enforces it.
// Kept equal to the frontend's locked version (package-lock.json) so both run the same client.
export { createClient } from 'npm:@supabase/supabase-js@2.95.3';
export type { SupabaseClient } from 'npm:@supabase/supabase-js@2.95.3';
