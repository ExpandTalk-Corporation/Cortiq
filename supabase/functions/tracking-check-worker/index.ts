// Drains the Tracking Check queue. Called by tracking-check-start, by itself and by the status nudge.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { processBatch, type Probes } from '../_shared/tracking-check/worker-core.ts';
import { fetchProbe } from '../_shared/tracking-check/fetch-probe.ts';
import { DEFAULT_BROWSERLESS_URL, runBrowserProbe } from '../_shared/tracking-check/browserless.ts';
import { detectForms } from '../_shared/form-detection.ts';
import { open } from '../_shared/tracking-check/secret-box.ts';
import { kickWorker } from '../_shared/tracking-check/kick.ts';
import { createStore } from './store.ts';

const BATCH_WINDOW_MS = 30_000;   // start new batches for 30 s; one browser task (≤ 100 s) still fits in 150 s

Deno.serve(async (req) => {
  const secret = Deno.env.get('TRACKING_CHECK_WORKER_SECRET');
  if (!secret || req.headers.get('x-worker-secret') !== secret) return new Response('Unauthorized', { status: 401 });

  const store = createStore(createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!));
  const probes: Probes = {
    fetchProbe: (url, auth) => fetchProbe(url, { basicAuth: auth }),
    browserProbe: async (url, states, auth) => {
      const { html, ...obs } = await runBrowserProbe({
        endpoint: Deno.env.get('BROWSERLESS_URL') || DEFAULT_BROWSERLESS_URL,
        token: Deno.env.get('BROWSERLESS_API_KEY') ?? '', url, states, basicAuth: auth,
      });
      return { ...obs, forms: detectForms(html) };
    },
    openAuth: async (ciphertext) => JSON.parse(await open(ciphertext, Deno.env.get('TRACKING_CHECK_AUTH_KEY')!)),
  };

  const work = (async () => {
    const started = Date.now();
    let total = { processed: 0, finalized: [] as string[], more: false };
    try {
      do {
        const r = await processBatch(store, probes);
        total = { processed: total.processed + r.processed, finalized: [...total.finalized, ...r.finalized], more: r.more };
        if (!r.processed && !r.finalized.length) break;   // nothing claimable right now (e.g. tasks running elsewhere)
      } while (total.more && Date.now() - started < BATCH_WINDOW_MS);
      if (total.more) kickWorker();
    } catch (e) {
      console.error('tracking-check-worker', e);
    }
    return total;
  })();

  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(work);
    return new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { 'Content-Type': 'application/json' } });
  }
  return Response.json(await work);
});
