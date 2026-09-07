import { describe, expect, it } from 'vitest';
import { csvObjects, parseCsv } from './csv';

describe('parseCsv', () => {
  it('supports BOM, quoted commas, escaped quotes and newlines', () => {
    expect(parseCsv('\uFEFFsku,name,description\r\nX1,"Star, red","Say ""hello""\nnext"')).toEqual([
      ['sku', 'name', 'description'], ['X1', 'Star, red', 'Say "hello"\nnext'],
    ]);
  });
  it('creates normalized objects', () => {
    expect(csvObjects('SKU,Name\nX1,Star')).toEqual([{ sku: 'X1', name: 'Star' }]);
  });
});
