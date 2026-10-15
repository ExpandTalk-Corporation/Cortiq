// tests/foundation/sentrisk-forms.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectSentriskForms } from '../../supabase/functions/_shared/sentrisk-forms.js';

const ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const ID2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

test('WordPress-rendered iframe is detected; shortcode text is not needed', () => {
  const html = `<div class="sentrisk-form-wrapper"><iframe src="https://www.sentrisk.se/embed/${ID}?page=x&locale=sv"
    class="sentrisk-form-iframe" title="SentriSK Form"></iframe></div>`;
  assert.deepEqual(detectSentriskForms(html), [{ formId: ID, method: 'iframe_src' }]);
});

test('SDK, adapter marker, legacy /form/ URL and both shortcode names', () => {
  const html = `
    <div data-sentrisk-form="${ID2.toUpperCase()}"></div>
    <!-- sentrisk:form id="${ID2}" -->
    <iframe src="https://sentrisk.se/form/${ID}"></iframe>
    [traffikboost_form id="${ID}" type="contact"]
    [sentrisk_form type="newsletter"]
    <div data-sentrisk-site="p1" data-sentrisk-slot="kontakt"></div>`;
  const ids = detectSentriskForms(html).map((f) => f.formId).sort();
  assert.deepEqual(ids, [ID, ID2, 'slot:kontakt', 'type:newsletter'].sort());
});

test('unrelated iframes and look-alike hosts are ignored', () => {
  const html = `<iframe src="https://evil-sentrisk.se.example.com/embed/${ID}"></iframe>
    <iframe src="https://www.youtube.com/embed/${ID}"></iframe>`;
  assert.deepEqual(detectSentriskForms(html), []);
});

test('form-detector uses the shared detector and records type "sentrisk"', () => {
  const src = readFileSync(new URL('../../supabase/functions/form-detector/index.ts', import.meta.url), 'utf8');
  assert.match(src, /detectSentriskForms\(html\)/);
  assert.match(src, /form_type: 'sentrisk'/);
  assert.doesNotMatch(src, /form_type: 'traffikboost'/);
});

test('tracker records SentriSK iframe submits only from sentrisk.se', () => {
  const src = readFileSync(new URL('../../public/spa-tracking.js', import.meta.url), 'utf8');
  assert.match(src, /type === 'sentrisk-form-submitted'/);
  assert.match(src, /\^https:\\\/\\\/\(www\\\.\)\?sentrisk\\\.se\$/);
});

test('no dashboard UI still calls the product "Traffikboost"', () => {
  for (const f of ['FormTypeSelector.tsx', 'FormDiscoveryWidget.tsx', 'FormAnalyticsOverview.tsx', 'SystemSpecificConfig.tsx']) {
    const src = readFileSync(new URL(`../../src/components/dashboard/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /name: 'Traffikboost'|: 'Traffikboost'|For Traffikboost/, f);
  }
});
