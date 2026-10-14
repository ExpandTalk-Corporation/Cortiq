// tests/foundation/csv.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../../src/lib/csv.ts';

test('formula-leading cells are neutralised', () => {
  for (const v of ['=SUM(A1)', '+1', '-2', '@cmd', '\tx']) {
    assert.ok(csvCell(v).startsWith(`"'`), v);
  }
  assert.equal(csvCell(-5), '"-5"'); // numbers are data, not formulas
});

test('quotes are doubled and null becomes empty', () => {
  assert.equal(csvCell('a "b"'), '"a ""b"""');
  assert.equal(csvCell(null), '""');
});

test('BOM, CRLF and Swedish characters', () => {
  const csv = toCsv(['Sida', 'Besök'], [['/åäö', 3]]);
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv, '﻿"Sida","Besök"\r\n"/åäö","3"\r\n');
});
