-- Close the public write hole on public.subscribers.
--
-- The original policies (20250805183803) were:
--   "update_own_subscription"  FOR UPDATE USING (true)      -- no TO clause → PUBLIC (anon+authenticated), no row scope
--   "insert_subscription"      FOR INSERT WITH CHECK (true) -- anyone can inject rows
-- With Supabase's default anon/authenticated table grants, a holder of the public
-- anon key could UPDATE any subscriber row (flip subscribed, set tier='enterprise',
-- overwrite stripe_customer_id) or INSERT arbitrary rows. This becomes a billing
-- bypass the moment feature-gating ships.
--
-- The only legitimate writers — check-subscription, create-checkout, the Stripe
-- webhook — all use the service-role key, which BYPASSES RLS. So these permissive
-- client policies serve no functional purpose; drop them. The SELECT policy
-- ("select_own_subscription": user_id = auth.uid() OR email = auth.email()) stays,
-- so users can still read their own subscription.

DROP POLICY IF EXISTS "update_own_subscription" ON public.subscribers;
DROP POLICY IF EXISTS "insert_subscription"     ON public.subscribers;
