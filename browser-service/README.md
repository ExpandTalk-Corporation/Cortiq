# browser-service

Self-hosted headless Chromium for Tracking Check (`POST /function`) and heatmap screenshots (`POST /screenshot`).
It implements the two Browserless v2 endpoints CortIQ uses, so the Edge Functions only need `BROWSERLESS_URL`
and `BROWSERLESS_API_KEY` pointed at it. It contains no Browserless code: Node + Puppeteer (Apache-2.0) and
`chrome-headless-shell` from the `ghcr.io/puppeteer/puppeteer` image.

Runs on one Hetzner Cloud server in Germany (Falkenstein or Nuremberg). EU egress matters for results, not only for
data protection: geo-targeted cookie banners (e.g. CookieYes) show no banner and auto-grant consent to US visitors.

## What leaves the server

Only the requests the checked page itself makes. `chrome-headless-shell` has no sign-in, omnibox, network-time
service or component updater; full Chrome contacted `accounts.google.com`, `clients2.google.com`,
`www.google.com` and `update.googleapis.com` on every launch. Verified 2026-11-06 with a DNS capture inside the
container: a run against example.com looked up only example.com.

`host/firewall.sh` additionally limits the container to DNS (Hetzner resolvers) and TCP 80/443 and blocks private
ranges, the host itself and the metadata service (169.254.169.254) — checked pages are untrusted.

## Hardening

- One browser per request; nothing persists between checks. The request timeout closes the browser.
- Logs hold no page addresses or page content: error messages have URLs replaced by `<url>`, the page address is in
  the request body (not logged) and Caddy logs the token as `REDACTED`. Logs rotate at 2 × 5 MB and are removed by the
  weekly container recreate below, so none are older than 14 days (the period stated in the privacy policy).
- Token compared in constant time; Caddy redacts it from access logs.
- `cap_drop: ALL`, `no-new-privileges`, non-root user, Chromium launched over a pipe (no DevTools port).
- `chrome-seccomp.json` = Docker's default profile ([moby/profiles@4b8214f](https://github.com/moby/profiles/blob/4b8214fc4971e06172938a1f1554ccff6647ee80/seccomp/default.json))
  plus `clone`, `clone3`, `unshare`, `setns`, `chroot` without capabilities, so Chromium's own renderer sandbox works
  without `CAP_SYS_ADMIN` or `--no-sandbox`.

## Deploy

1. Hetzner Cloud: accept the data processing agreement (Console → Security/Profile → GDPR), create an Ubuntu server
   with ≥ 4 GB RAM in Falkenstein or Nuremberg, install Docker and `tcpdump`. Point a DNS name (e.g.
   `browser.cortiq.se`) at it and open ports 80/443.
2. On the server:
   ```sh
   git clone https://github.com/ExpandTalk-Corporation/Cortiq.git && cd Cortiq/browser-service
   printf 'BROWSER_TOKEN=%s\nBROWSER_HOST=browser.cortiq.se\n' "$(openssl rand -hex 32)" > .env
   docker compose up -d --build
   sudo sh host/firewall.sh        # re-run after every reboot (e.g. a systemd oneshot After=docker.service)
   # Weekly recreate deletes container logs (privacy policy: browser server logs ≤ 14 days):
   echo "0 4 * * 1 root cd $PWD && docker compose up -d --force-recreate && sh host/firewall.sh" | sudo tee /etc/cron.d/browser-service
   ```
3. Supabase secrets, then redeploy `tracking-check-worker` and `take-screenshot`:
   ```sh
   supabase secrets set BROWSERLESS_URL=https://browser.cortiq.se BROWSERLESS_API_KEY=<BROWSER_TOKEN>
   ```
   Neither function falls back to a default host: if the secrets are missing they fail.
4. Verify egress: `sudo sh host/egress-report.sh 180`, run a Tracking Check and a heatmap screenshot during the
   window, and check that only the checked sites' own hosts are listed.
5. Smoke test from a laptop: `BROWSERLESS_URL=… BROWSERLESS_API_KEY=… node scripts/tracking-check/probe-smoke.mjs https://www.ikea.com/se/sv/`

## Upgrading Chromium

Bump the image tag in `Dockerfile` and `puppeteer` in `package.json` to the same version, `npm install
--package-lock-only`, rebuild, then repeat step 4.
