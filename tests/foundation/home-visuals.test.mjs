// Homepage visuals: sample data stays illustrative and consistent, colours stay readable,
// and every component that shows sample numbers says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CATEGORY_COLORS } from '../../src/components/home/categoryColors.ts';
import { HERO_DAYS, HERO_HUMAN_VISITS, HERO_TOP_BOTS } from '../../src/data/homeSample.ts';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const HOME = 'src/components/home/';
const homeFiles = () => readdirSync(new URL(HOME, root)).filter((f) => /\.tsx?$/.test(f)).map((f) => HOME + f);

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('category colours reach WCAG AA (4.5:1) on white', () => {
  for (const [category, c] of Object.entries(CATEGORY_COLORS)) {
    const ratio = 1.05 / (luminance(c.hex) + 0.05);
    assert.ok(ratio >= 4.5, `${category} ${c.hex} contrast ${ratio.toFixed(2)}`);
  }
  assert.deepEqual(Object.keys(CATEGORY_COLORS).sort(), ['agentic', 'citation', 'training']);
});

test('sample numbers are positive integers and top bots fit inside their category totals', () => {
  assert.equal(HERO_DAYS.length, 14);
  for (const day of HERO_DAYS) for (const v of Object.values(day)) assert.ok(Number.isInteger(v) && v > 0);
  assert.ok(Number.isInteger(HERO_HUMAN_VISITS) && HERO_HUMAN_VISITS > 0);
  const totals = {};
  for (const day of HERO_DAYS) for (const [c, v] of Object.entries(day)) totals[c] = (totals[c] ?? 0) + v;
  const used = {};
  for (const b of HERO_TOP_BOTS) used[b.category] = (used[b.category] ?? 0) + b.visits;
  for (const [c, v] of Object.entries(used)) assert.ok(v <= totals[c], `${c}: top bots ${v} > total ${totals[c]}`);
});

test('every homepage component that uses sample data shows the Example data label', () => {
  assert.match(read(HOME + 'BrowserFrame.tsx'), /EXAMPLE_LABEL = "Example data"/);
  for (const file of homeFiles()) {
    const src = read(file);
    if (!src.includes('@/data/homeSample')) continue;
    assert.ok(/<BrowserFrame|<ExampleTag/.test(src), `${file} uses sample data without the Example data label`);
  }
});

test('sample data names no bots (names come from the registry)', () => {
  assert.doesNotMatch(read('src/data/homeSample.ts'), /[A-Za-z]Bot\b|-User\b/);
});
