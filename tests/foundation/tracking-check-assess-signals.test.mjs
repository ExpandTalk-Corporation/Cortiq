import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { containsEmail, emailParams, parseGcd, parseGcs } from '../../supabase/functions/_shared/tracking-check/assess/signals.ts';
import { page, site, st, req, POLICY } from './tracking-check-fixtures.mjs';

const hit = (gcs, gcd = '') => `https://region1.google-analytics.com/g/collect?v=2&tid=G-6J9DFZLXNL&gcs=${gcs}${gcd ? `&gcd=${gcd}` : ''}`;
const LAX = { ...POLICY, noGoogleBeforeConsent: false };
const run = (states, { policy = LAX, path = '/' } = {}) =>
  assess({ mode: 'policy', baseline: null, policy, target: site('target', [page(path, { states })]) });
const byKey = (findings, key) => findings.filter((f) => f.checkKey === key);

test('parseGcs and parseGcd decode the Consent Mode parameters', () => {
  assert.deepEqual(parseGcs('G111'), { ad: '1', analytics: '1' });
  assert.deepEqual(parseGcs('G1--'), { ad: '-', analytics: '-' });
  assert.equal(parseGcs('nonsense'), null);
  assert.deepEqual(parseGcd('13r3r3r2r5'), { ad_storage: 'r', analytics_storage: 'r', ad_user_data: 'r', ad_personalization: 'r' });
  assert.equal(parseGcd('x'), null);
});

test('G111 before the choice fails, and gcd "granted by default" names a hardcoded default', () => {
  const findings = run([st('none', { requests: [req(hit('G111', '13t3t3t3t5'))] }), st('reject'), st('accept')]);
  const [f] = byKey(findings, 'consent.signal.granted_before_choice');
  assert.equal(f.status, 'fail');
  assert.equal(f.typicalOwner, 'cmp');
  assert.match(f.explanation, /hardcoded to granted/);
  assert.match(f.fix, /gtag\('consent', 'default'/);
  assert.match(f.fix, /Consent Initialization – All Pages/);
});

test('G111 after "Reject all" fails; an unverified reject is not judged', () => {
  const states = (method) => [st('none'), st('reject', { method, requests: [req(hit('G111'))] }), st('accept')];
  assert.equal(byKey(run(states('adapter')), 'consent.signal.granted_after_reject')[0].status, 'fail');
  assert.equal(byKey(run(states('not_automated')), 'consent.signal.granted_after_reject').length, 0);
});

test('G1-- means Consent Mode is missing', () => {
  const [f] = byKey(run([st('none', { requests: [req(hit('G1--'))] }), st('reject'), st('accept')]), 'consent.signal.missing');
  assert.equal(f.status, 'fail');
  assert.equal(f.typicalOwner, 'gtm');
});

test('G100 before the choice is advanced mode: a decision for the controller, unless the policy forbids Google', () => {
  const states = [st('none', { requests: [req(hit('G100'))] }), st('reject'), st('accept', { requests: [req(hit('G111'))] })];
  const [f] = byKey(run(states), 'consent.signal.advanced');
  assert.equal(f.status, 'manual');
  assert.match(f.explanation, /assessed by the controller/);
  assert.equal(byKey(run(states, { policy: POLICY }), 'consent.signal.advanced').length, 0, 'the strict Google policy already fails these requests');
});

test('"Accept all" that still sends G100 is a warning; correct signals pass', () => {
  const lost = run([st('none'), st('reject'), st('accept', { requests: [req(hit('G100'))] })]);
  assert.equal(byKey(lost, 'consent.signal.accept_not_forwarded')[0].status, 'warning');
  const ok = run([st('none'), st('reject'), st('accept', { requests: [req(hit('G111'))] })]);
  assert.equal(byKey(ok, 'consent.signal')[0].status, 'pass');
  assert.equal(byKey(run([st('none'), st('reject'), st('accept')]), 'consent.signal').length, 0, 'no Google signals, no finding');
});

test('email detection ignores credentials in URLs, retina images and hashed values', () => {
  assert.equal(containsEmail('https://new.example/thanks?email=anna%40example.se'), true);
  assert.equal(containsEmail('https%253A%252F%252Fnew.example%252F%253Fe%253Danna%252540example.se'), true, 'double-encoded');
  assert.equal(containsEmail('https://key@o123.ingest.sentry.io/1'), false);
  assert.equal(containsEmail('/img/logo@2x.png'), false);
  assert.equal(containsEmail('tv.1~em.5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'), false);
  assert.deepEqual(emailParams('https://region1.google-analytics.com/g/collect?v=2&dl=https%3A%2F%2Fnew.example%2Fthanks%3Femail%3Danna%2540example.se&en=page_view'), ['dl']);
});

test('signed Cloud Storage and S3 URLs are not email leaks (service accounts, not visitors)', () => {
  // Paligo report, row 12: a signed GCS URL whose credential names a service account.
  const gcs = 'https://storage.googleapis.com/bucket/video.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256'
    + '&X-Goog-Credential=media-signer%40paligo-prod.iam.gserviceaccount.com%2F20261107%2Fauto%2Fstorage%2Fgoog4_request'
    + '&X-Goog-Date=20261107T120000Z&X-Goog-Expires=3600&X-Goog-SignedHeaders=host&X-Goog-Signature=abc';
  assert.deepEqual(emailParams(gcs), []);
  assert.equal(containsEmail('123-compute@developer.gserviceaccount.com'), false);
  assert.deepEqual(emailParams('https://bucket.s3.amazonaws.com/a.pdf?X-Amz-Credential=ops%40example.com%2F20261107%2Feu-north-1%2Fs3%2Faws4_request'), []);
  // A visitor's address in another parameter of the same request is still found.
  assert.deepEqual(emailParams(`${gcs}&ref=anna%40example.se`), ['ref']);
});

test('an email address sent to a third party fails without echoing the address', () => {
  const leak = 'https://www.facebook.com/tr/?id=1&ev=PageView&dl=https%3A%2F%2Fnew.example%2Fthanks%3Femail%3Danna%2540example.se';
  const findings = run([st('none'), st('reject'), st('accept', { requests: [req(leak), req('https://new.example/api?email=anna@example.se')] })], { path: '/thanks?email=anna@example.se' });
  const [f] = byKey(findings, 'privacy.email_in_url');
  assert.equal(f.status, 'fail');
  assert.deepEqual(f.evidence.details, ['www.facebook.com: dl'], 'own-site requests are not third parties');
  assert.deepEqual(f.evidence.pages, ['/thanks?email']);
  assert.doesNotMatch(JSON.stringify(f), /anna/);
});

test('third-party requests without email addresses pass', () => {
  const [f] = byKey(run([st('none'), st('reject'), st('accept', { requests: [req(hit('G111'))] })]), 'privacy.email_in_url');
  assert.equal(f.status, 'pass');
  assert.match(f.explanation, /thank-you page/);
});

test('a banner that reappears after an adapter choice is its own finding for the CMP', () => {
  const findings = run([st('none'), st('reject', { bannerAfterChoice: true }), st('accept', { bannerAfterChoice: false })]);
  const [f] = byKey(findings, 'consent.choice_not_remembered');
  assert.equal(f.status, 'fail');
  assert.equal(f.typicalOwner, 'cmp');
  assert.deepEqual(f.evidence.details, ['/: banner shown again after "Reject all"']);
  assert.equal(byKey(run([st('none'), st('reject'), st('accept')]), 'consent.choice_not_remembered').length, 0, 'not measured, no finding');
});

test('built-in manual items carry their own guidance and owner', () => {
  const policy = { ...POLICY, manualItems: [{ key: 'privacy_policy', label: 'Privacy policy' }, { key: 'custom_x', label: 'Custom' }] };
  const findings = run([st('none'), st('reject'), st('accept')], { policy });
  const [pp] = byKey(findings, 'manual.privacy_policy');
  assert.equal(pp.typicalOwner, 'legal');
  assert.match(pp.explanation, /Data Privacy Framework/);
  assert.equal(byKey(findings, 'manual.custom_x')[0].typicalOwner, 'marketing');
});

test('no Consent Mode is a warning when the Google tags wait for consent, and a fail when they do not', () => {
  const gtag = 'https://www.googletagmanager.com/gtag/js?id=G-6J9DFZLXNL';
  const waits = run([st('none'), st('reject'), st('accept', { requests: [req(gtag), req(hit('G1--'))] })]);
  const [w] = byKey(waits, 'consent.defaults');
  assert.equal(w.status, 'warning');
  assert.match(w.title, /decide whether you need it/);
  assert.equal(byKey(waits, 'consent.signal.missing').length, 0, 'G1-- after accept is not a pre-consent problem');
  const fires = run([st('none', { requests: [req(gtag), req(hit('G1--'))] }), st('reject'), st('accept')]);
  assert.equal(byKey(fires, 'consent.defaults')[0].status, 'fail');
  assert.equal(byKey(fires, 'consent.signal.missing')[0].status, 'fail');
});

test('CDNs are not unknown third parties; a podcast player is a Verify item', () => {
  const reject = st('reject', { requests: [
    req('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js'),
    req('https://example.akamaized.net/app.js'),
    req('https://cdn.jsdelivr.net/npm/swiper/swiper.min.js'),
    req('https://html5-player.libsyn.com/embed/episode/id/123'),
  ] });
  const findings = run([st('none'), reject, st('accept')]);
  assert.equal(byKey(findings, 'consent.unknown_after_reject')[0].status, 'pass');
  assert.equal(byKey(findings, 'consent.after_reject.verify.libsyn')[0].status, 'manual');
});

test('Akamai mPulse is analytics, not CDN infrastructure', () => {
  const reject = st('reject', { requests: [req('https://c.go-mpulse.net/boomerang/ABC-123'), req('https://173e2548.akstat.io/')] });
  const [f] = byKey(run([st('none'), reject, st('accept')]), 'consent.after_reject.cookieless.akamai-mpulse');
  assert.equal(f.status, 'warning');
});
