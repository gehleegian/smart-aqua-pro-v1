import assert from 'node:assert/strict';
import test from 'node:test';
import { paginationWindow, paginationPages } from '../../src/utils/pagination.ts';

test('pagination handles empty, exact, partial and out-of-range windows', () => {
  assert.deepEqual(paginationWindow(0, 7, 10), {total:0,page:1,pageSize:10,pageCount:1,startIndex:0,start:0,end:0});
  assert.deepEqual(paginationWindow(23, 3, 10), {total:23,page:3,pageSize:10,pageCount:3,startIndex:20,start:21,end:23});
  assert.equal(paginationWindow(20, 2, 10).end, 20);
  assert.equal(paginationWindow(20, 3, 10).page, 2);
  assert.equal(paginationWindow(10, -5, 5).page, 1);
  assert.equal(paginationWindow(NaN, Infinity, 0).total, 0);
  assert.equal(paginationWindow(5, 1, NaN).pageSize, 10);
});

test('all loaded records are reachable exactly once with continuous indices', () => {
  for (const total of [0,1,5,10,11,30,50,171,1000]) for (const size of [5,10,20,50]) {
    const entries = Array.from({length:total}, (_, i) => i + 1);
    const found = [];
    for (let page=1;page<=paginationWindow(total,1,size).pageCount;page++) {
      const p=paginationWindow(total,page,size);
      found.push(...entries.slice(p.startIndex,p.end));
    }
    assert.deepEqual(found,entries);
  }
});

test('page-number controls remain bounded and include endpoints/current page', () => {
  for (const total of [1,2,7,8,20,1000]) for (let page=1;page<=total;page++) {
    const pages=paginationPages(page,total);
    assert.ok(pages.length<=7);
    const numbered=pages.filter(p=>typeof p==='number');
    assert.equal(numbered[0],1);
    assert.equal(numbered.at(-1),total);
    assert.ok(numbered.includes(page));
    assert.equal(new Set(numbered).size,numbered.length);
    assert.deepEqual([...numbered].sort((a,b)=>a-b),numbered);
  }
});
