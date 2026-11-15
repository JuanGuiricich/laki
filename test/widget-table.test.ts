// K3: the table's full view: sortable headers (each cell's order as data-v), boxes and a bulk bar for rows with an id,
// rows past 200 hidden till scrolled to; the check
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { uiCheck, uiHtml } from '../src/shared/widgetUi.ts'

const ctx = (data: unknown) => ({ data, config: {}, at: 0 })
const rows = [
  { id: 'a', n: 10, when: '2026-11-02T10:00:00Z', who: 'ann' },
  { id: 'b', n: 9, when: '2026-11-10T10:00:00Z', who: 'bob' },
  { n: 100, when: '2026-10-01T10:00:00Z', who: 'cid' },
]
const spec = { type: 'table', each: 'r', sortable: true, select: true, bulk: [{ label: 'Close', run: 'close' }], columns: [{ title: 'N', value: '{{n}}' }, { title: 'When', value: '{{ago when}}' }, { title: 'Who', value: 'by {{who}}', sortable: false }, { title: 'Raw', value: '{{who}}!', sortBy: 'n' }] }

test('table: sortable headers and their cells’ order, in the full view only', () => {
  const full = uiHtml(spec, ctx({ r: rows }), { full: true })
  assert.deepEqual(full.match(/data-sort="\d"/g), ['data-sort="0"', 'data-sort="1"', 'data-sort="3"'], 'a column with sortable: false is left out')
  assert.match(full, /<td class=""\s*data-v="10">/, 'a lone template: its value')
  assert.match(full, /data-v="2026-11-02T10:00:00Z"/, '{{ago when}}: when itself')
  assert.match(full, /<td class="" data-v="10"><span class="">ann!</, "sortBy: that path")
  const cell = uiHtml(spec, ctx({ r: rows }), { cells: [4, 2] })
  assert.doesNotMatch(cell, /data-sort|data-sel|k-bulk/, 'a cell: none of it')
})

test('table: a box per row with an id, the all box, the bulk bar with its buttons; rows past 200 wait', () => {
  const full = uiHtml(spec, ctx({ r: rows }), { full: true })
  assert.equal((full.match(/data-sel value=/g) ?? []).length, 2, 'the row without an id: no box')
  assert.match(full, /<input type="checkbox" data-sel value="a"/)
  assert.match(full, /data-sel-all/)
  assert.match(full, /<div class="k-bulk" data-bulk hidden><span class="k-sub" data-bulk-n><\/span><button data-bulk-run type="button"[^>]*data-run="close"/)
  const big = uiHtml({ type: 'table', each: 'r', columns: [{ value: '{{n}}' }] }, ctx({ r: Array.from({ length: 450 }, (_, n) => ({ n })) }), { full: true })
  assert.equal((big.match(/<tr data-row>/g) ?? []).length, 200)
  assert.equal((big.match(/data-lazy hidden/g) ?? []).length, 250)
  assert.match(big, /<div class="k-lazy" data-lazy-more><\/div>/)
  assert.doesNotMatch(uiHtml({ type: 'table', each: 'r', columns: [{ value: '{{n}}' }] }, ctx({ r: [{ n: 1 }] }), { full: true }), /data-lazy/, '200 or fewer: none')
})

test('table: the check: rows without an id, bulk without select, bulk’s actions', () => {
  assert.match(JSON.stringify(uiCheck(spec, { r: rows }, { actions: ['close'] })), /each row needs an \\"id\\"/)
  assert.deepEqual(uiCheck({ ...spec, bulk: [{ label: 'X', run: 'close' }] }, { r: rows.slice(0, 2) }, { actions: ['close'] }), [])
  assert.match(JSON.stringify(uiCheck({ ...spec, select: undefined }, { r: rows.slice(0, 2) }, { actions: ['close'] })), /show with \\"select\\": true/)
  assert.match(JSON.stringify(uiCheck({ ...spec, bulk: [{ label: 'X', run: 'nope' }] }, { r: rows.slice(0, 2) }, { actions: ['close'] })), /nope/)
  assert.match(JSON.stringify(uiCheck({ ...spec, bulk: 'x' }, { r: rows.slice(0, 2) })), /bulk: a list of buttons/)
})
