// Starts or continues the Tracking Check worker without waiting for its work to finish.
// The worker answers 202 at once and continues in EdgeRuntime.waitUntil.
export function kickWorker(): void {
  const pending = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/tracking-check-worker`, {
    method: 'POST',
    headers: { 'x-worker-secret': Deno.env.get('TRACKING_CHECK_WORKER_SECRET') ?? '' },
  })
    .then((res) => res.body?.cancel())
    .catch((e) => console.error('tracking-check: worker kick failed', e));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(pending);
}
