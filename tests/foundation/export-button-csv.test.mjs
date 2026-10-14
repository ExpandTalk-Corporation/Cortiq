// The legacy ExportButton must build CSV through the shared injection-safe helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../src/components/dashboard/ExportButton.tsx', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('function convertToCSV'), src.indexOf('function convertToJSON'));

test('ExportButton CSV goes through toCsv from src/lib/csv', () => {
  assert.match(src, /import \{[^}]*\btoCsv\b[^}]*\} from '@\/lib\/csv'/);
  assert.ok(body.includes('toCsv('), 'convertToCSV must call toCsv');
  assert.ok(!body.includes('.replace(/"/g'), 'no hand-rolled quoting left');
});
