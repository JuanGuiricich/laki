// K6: a chart's ticks at round steps, threshold lines, a line over time by each row's at, a point's click with its row,
// x labels; each point's tooltip as data-tip, shown by uiBehave by it (a line's dot where the point is)
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { uiBehave } from '../src/shared/widget.ts'
import { uiCheck, uiHtml } from '../src/shared/widgetUi.ts'

const ctx = (data: unknown) => ({ data, config: {}, at: 0 })
const d = [3, 40, 97].map((v, i) => ({ day: `d${i}`, v }))

test('chart: ticks at round steps, the scale widened to them; a min stays', () => {
  const html = uiHtml({ type: 'chart', each: 'd', x: '{{day}}', y: '{{v}}', ticks: 5 }, ctx({ d }), { full: true })
  const labels = [...html.matchAll(/<span style="top:[\d.]+%">(\d+)<\/span>/g)].map(m => m[1])
  assert.deepEqual(labels, ['0', '20', '40', '60', '80', '100'])
  assert.match(html, /<div class="k-ch-axis ticks"><span class="k-ch-w">100<\/span>/, 'the widest label holds the column’s width')
  assert.equal((html.match(/<line class="grid"/g) ?? []).length, 6, 'a grid line each')
  const kept = uiHtml({ type: 'chart', each: 'd', y: '{{v}}', ticks: 5, min: 3 }, ctx({ d }), { full: true })
  assert.deepEqual([...kept.matchAll(/<span style="top:[\d.]+%">(\d+)<\/span>/g)].map(m => m[1]), ['20', '40', '60', '80', '100'], 'min 3: no tick under it')
  assert.doesNotMatch(uiHtml({ type: 'chart', each: 'd', y: '{{v}}', ticks: 5 }, ctx({ d }), { cells: [3, 0.5] }), /ticks/, 'a line: none')
})

test('chart: thresholds as dashed lines in their tone, in sight, labeled', () => {
  const html = uiHtml({ type: 'chart', each: 'd', y: '{{v}}', threshold: [{ value: 150, label: 'SLO', tone: 'bad' }, { value: 50 }] }, ctx({ d }), { full: true })
  assert.equal((html.match(/class="k-ch-th"/g) ?? []).length, 2)
  assert.match(html, /<line class="k-ch-th" x1="0" x2="100" y1="2.0" y2="2.0"[^>]*style="color:var\(--error/, '150 is the top now')
  assert.match(html, /<span class="k-ch-thl" style="top:5.0%;color:var\(--error[^"]*">SLO<\/span>/)
  assert.match(html, /<div class="k-ch-axis"><span>150<\/span>/)
  assert.match(JSON.stringify(uiCheck({ type: 'chart', each: 'd', y: '{{v}}', threshold: [{ label: 'x' }, true] }, { d })), /threshold\[0\].*its value.*threshold\[1\]/)
  assert.deepEqual(uiCheck({ type: 'chart', each: 'd', y: '{{v}}', threshold: ['{{limit}}', 80] }, { d, limit: 60 }), [], 'a template or a number')
})

test('chart: a line over time by its rows’ at, sorted; time labels; the head’s value the latest', () => {
  const t = Date.parse('2026-11-10T00:00:00Z')
  const rows = [
    { at: new Date(t + 3 * 3600_000).toISOString(), v: 30 },
    { at: new Date(t).toISOString(), v: 10 },
    { at: String(t + 3600_000), v: 20 }, // ms as text
  ]
  const html = uiHtml({ type: 'chart', each: 'r', y: '{{v}}', xticks: 4, label: 'reqs' }, ctx({ r: rows }), { full: true })
  assert.match(html, /<polyline points="0.0,38.0 33.3,20.0 100.0,2.0"/, 'placed by time, in its order')
  assert.match(html, /<b>30<\/b>/, 'the latest')
  assert.equal((html.match(/<div class="k-ch-xt">(.*?)<\/div>/)?.[1].match(/<span/g) ?? []).length, 4)
  assert.match(html, /data-tip="\d\d:\d\d\n10" data-px="0.0"/, 'its time in the tooltip')
  const h = (x: string) => Number(/k-ch-body[^"]*" style="height:(\d+)px/.exec(x)?.[1])
  const cell = (o: object) => uiHtml({ type: 'chart', each: 'r', y: '{{v}}', ...o }, ctx({ r: rows }), { cells: [2, 2] })
  assert.equal(h(cell({ xticks: 3, xlabel: 'time', ylabel: 'reqs' })), h(cell({})) - 37, 'a cell: its labels inside its height')
  const plain = uiHtml({ type: 'chart', each: 'r', y: '{{v}}' }, ctx({ r: rows.map(({ v }) => ({ v })) }), { full: true })
  assert.match(plain, /<polyline points="0.0,[\d.]+ 50.0,[\d.]+ 100.0,/, 'no at: by place')
  assert.match(uiHtml({ type: 'chart', kind: 'bars', each: 'r', y: '{{v}}' }, ctx({ r: rows }), { full: true }), /<rect x=/, 'bars stay bars')
})

test('chart: run on a point with its row as JSON; the check', () => {
  const html = uiHtml({ type: 'chart', kind: 'bars', each: 'd', x: '{{day}}', y: '{{v}}', run: 'open' }, ctx({ d }), { full: true })
  assert.match(html, /<rect class="k-ch-slot"[^>]* data-run="open" data-arg="\{&quot;day&quot;:&quot;d0&quot;,&quot;v&quot;:3\}"\/>/)
  assert.match(uiHtml({ type: 'chart', kind: 'pie', each: 'd', x: '{{day}}', y: '{{v}}', run: 'open' }, ctx({ d }), {}), /<circle[^>]* data-tip="d1: 40 \(29%\)" data-run="open"/)
  assert.match(uiHtml({ type: 'chart', kind: 'hbars', each: 'd', x: '{{day}}', y: '{{v}}', run: 'open' }, ctx({ d }), {}), /class="k-hb" data-row data-tip="d2: 97" data-run="open"/)
  assert.doesNotMatch(uiHtml({ type: 'chart', each: 'd', y: '{{v}}', run: 'open' }, ctx({ d }), { cells: [3, 0.5] }), /data-run/, 'a line: nothing to click')
  assert.match(JSON.stringify(uiCheck({ type: 'chart', each: 'd', y: '{{v}}', run: 'nope' }, { d }, { actions: ['open'] })), /runs nope, which isn't one of widget.json's actions/)
  assert.deepEqual(uiCheck({ type: 'chart', each: 'd', y: '{{v}}', run: 'open', ticks: 4, xticks: 3, xlabel: 'day', ylabel: 'ms', threshold: [{ value: 50, tone: 'warn' }] }, { d }, { actions: ['open'] }), [])
})

test('chart: uiBehave shows a point’s tooltip by it, a line’s dot at it, gone as the pointer leaves', () => {
  const on: Record<string, (e: unknown) => void> = {}
  uiBehave({ addEventListener: (t: string, f: any) => (on[t] = f), removeEventListener: () => {} }, () => {})
  const made: any[] = []
  const el = (cls = '') => {
    const kids: any[] = []
    const e: any = { className: cls, style: {}, attrs: {} as Record<string, string>, kids, removed: false }
    e.setAttribute = (k: string, v: string) => (e.attrs[k] = v)
    e.getAttribute = (k: string) => e.attrs[k] ?? null
    e.appendChild = (x: any) => (kids.push(x), x)
    e.remove = () => (e.removed = true)
    e.getBoundingClientRect = () => ({ left: 100, top: 50, width: 7, height: 7 })
    e.offsetWidth = 40
    e.offsetHeight = 20
    return e
  }
  const ch = el('k-chart')
  const plot = el('k-ch-plot')
  plot.attrs['data-hc'] = 'red'
  const slot = el()
  Object.assign(slot.attrs, { 'data-tip': 'Tue\n280 ms', 'data-px': '50.0', 'data-py': '20.0' })
  const live = () => [...ch.kids, ...plot.kids].filter(x => !x.removed)
  ch.ownerDocument = { createElement: () => (x => (made.push(x), x))(el()) }
  ch.querySelector = (q: string) => live().find(x => q.split(', ').some(c => c === `.${x.className}`)) ?? null
  ch.querySelectorAll = (q: string) => live().filter(x => q.split(', ').some(c => c === `.${x.className}`))
  ch.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 100 })
  slot.closest = (q: string) => (q === '.k-chart [data-tip]' ? slot : q === '.k-chart' ? ch : q === '.k-ch-plot' ? plot : null)
  on.mouseover({ type: 'mouseover', target: slot, clientX: 10, clientY: 10 })
  const tip = made.find(x => x.className === 'k-ch-tip')
  const dot = made.find(x => x.className === 'k-ch-hov')
  assert.equal(tip.textContent, 'Tue\n280 ms')
  assert.equal(tip.attrs.role, 'tooltip')
  assert.deepEqual([dot.style.left, dot.style.top, dot.style.background], ['50.0%', '20.0%', 'red'])
  assert.deepEqual([tip.style.left, tip.style.top], ['83.5px', '26px'], 'centered over the dot, above it')
  on.mouseout({ type: 'mouseout', target: slot, relatedTarget: { closest: () => slot } })
  assert.ok(!tip.removed, 'to the next point: it stays')
  on.mouseout({ type: 'mouseout', target: slot, relatedTarget: null })
  assert.ok(tip.removed && dot.removed)
})
