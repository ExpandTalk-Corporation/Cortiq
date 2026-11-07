import puppeteer from 'puppeteer';
import { createApp } from './app.mjs';

const token = process.env.BROWSER_TOKEN;
if (!token || token.length < 32) {
  console.error('BROWSER_TOKEN must be set (≥ 32 chars)');
  process.exit(1);
}

// chrome-headless-shell has no sign-in, omnibox, network-time or component updater: full Chrome
// (headless: true) contacted accounts.google.com, clients2.google.com, www.google.com and
// update.googleapis.com on every launch even with the flags below. The flags stay as a second layer.
const ARGS = [
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--disable-client-side-phishing-detection',
  '--disable-sync',
  '--disable-default-apps',
  '--disable-field-trial-config',
  '--metrics-recording-only',
  '--no-first-run',
  '--no-pings',
  '--safebrowsing-disable-auto-update',
  '--disable-features=OptimizationHints,MediaRouter,Translate,AutofillServerCommunication,CertificateTransparencyComponentUpdater',
  '--disable-dev-shm-usage',
];

// pipe: true → no remote-debugging port is opened, so pages cannot reach the DevTools endpoint.
const launch = () => puppeteer.launch({ headless: 'shell', pipe: true, args: ARGS });

const port = Number(process.env.PORT) || 3000;
createApp({ launch, token, maxConcurrent: Number(process.env.MAX_CONCURRENT) || 2 })
  .listen(port, () => console.log(`browser-service listening on :${port}`));
