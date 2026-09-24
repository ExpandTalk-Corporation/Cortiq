import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/components/SiteCookieBanner.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;

function mount(saved) {
  const states = [];
  const effects = [];
  const timers = [];
  const restored = [];
  const exports = {};
  let index = 0;
  runInNewContext(code, {
    exports, Date, JSON, console,
    localStorage: { getItem: () => saved },
    setTimeout: fn => { timers.push(fn); return 1; }, clearTimeout() {},
    // Access to DOM tracking tags or network would fail: neither is needed here.
    require(name) {
      if (name === 'react') return {
        useState(value) { const key = index++; states[key] = value; return [value, next => { states[key] = next; }]; },
        useEffect(fn) { effects.push(fn); },
      };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name.includes('useGoogleConsentMode')) return { useGoogleConsentMode: () => ({ updateConsent: value => restored.push(value) }) };
      return {};
    },
  });
  const view = exports.SiteCookieBanner();
  effects.forEach(fn => fn());
  timers.forEach(fn => fn());
  return { states, restored, view };
}

for (const saved of [null, '{broken', JSON.stringify({ analytics: true }), JSON.stringify({ analytics: true, marketing: false, preferences: false, expiresAt: '2000-01-01' })]) {
  test(`site banner requests a new choice without requiring a tracking tag: ${saved}`, () => {
    const result = mount(saved);
    assert.equal(result.states[0], true);
    assert.equal(result.restored.length, 0);
  });
}

test('valid saved choice restores all purposes and retains a settings button', () => {
  const result = mount(JSON.stringify({ analytics: false, marketing: false, preferences: true, expiresAt: '2099-01-01' }));
  assert.equal(result.states[0], false);
  assert.equal(result.restored.length, 1);
  assert.equal(result.restored[0].analytics, false);
  assert.equal(result.view.props.children, 'Cookie settings');
  result.view.props.onClick();
  assert.equal(result.states[0], true);
});
