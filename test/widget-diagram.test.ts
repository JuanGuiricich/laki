// K4: the diagram element (its code, escaped: the app draws it with mermaid, anywhere else it shows) and the qr element
// (an inline SVG of qr.ts' code, dark on white); the check; the daemon's HTML of both
import { strict as assert } from 'node:assert'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { qr, qrPath } from '../src/shared/qr.ts'
import { uiCheck, uiHtml } from '../src/shared/widgetUi.ts'
import { fresh, until } from './helpers.ts'

const ctx = (data: unknown) => ({ data, config: {}, at: 0 })

test('diagram: its code in a block the window draws, escaped; filled from data', () => {
  const html = uiHtml({ type: 'diagram', code: 'flowchart LR\n  a[{{from}}] --> b["<b>x</b>"]' }, ctx({ from: '<script>' }), { full: true })
  assert.match(html, /<div class="k-diagram[^"]*" data-diagram><pre class="k-diagram-code"><code>flowchart LR\n {2}a\[&lt;script&gt;\] --&gt; b\[&quot;&lt;b&gt;x&lt;\/b&gt;&quot;\]<\/code><\/pre><\/div>/)
  assert.doesNotMatch(html, /<script|<b>/)
})

test('qr: the code as an SVG, its size clamped, too long said', () => {
  const url = 'http://192.168.1.20:5173'
  const html = uiHtml({ type: 'qr', value: '{{url}}', size: 90 }, ctx({ url }), {})
  const m = qr(url)
  assert.match(html, new RegExp(`<svg class="k-qr[^"]*" viewBox="0 0 ${m.length + 8} ${m.length + 8}" width="90" height="90"`))
  assert.ok(html.includes(`<path d="${qrPath(m)}" fill="#000"/>`), 'qr.ts’ modules')
  assert.match(html, /aria-label="QR code: http:\/\/192\.168\.1\.20:5173"/)
  assert.match(uiHtml({ type: 'qr', value: 'x', size: 5000 }, ctx({}), {}), /width="1000"/)
  assert.match(uiHtml({ type: 'qr', value: 'x' }, ctx({}), {}), /width="120"/)
  assert.doesNotMatch(uiHtml({ type: 'qr', value: '{{none}}' }, ctx({}), {}), /k-qr/, 'nothing to hold: nothing')
  assert.match(uiHtml({ type: 'qr', value: '{{big}}' }, ctx({ big: 'x'.repeat(3000) }), {}), /k-qr-no[^>]*>too long for a QR code</)
})

test('diagram and qr: the check', () => {
  assert.deepEqual(uiCheck({ type: 'diagram', code: 'graph TD; a-->b' }, {}), [])
  assert.match(JSON.stringify(uiCheck({ type: 'diagram' }, {})), /diagram: its code/)
  assert.deepEqual(uiCheck({ type: 'qr', value: '{{url}}' }, { url: 'x' }), [])
  assert.match(JSON.stringify(uiCheck({ type: 'qr' }, {})), /qr: its value/)
  assert.match(JSON.stringify(uiCheck({ type: 'qr', value: 'x'.repeat(2400) }, {})), /too long for a QR code/)
})

test('the daemon’s HTML of an extension with both: the code and the SVG', async t => {
  const rig = await fresh(t)
  const dir = join(rig.data, 'widgets', 'phone')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'widget.json'), JSON.stringify({ name: 'Phone', fetch: 'echo \'{"url":"https://example.com/p"}\'', every: 1440, ui: { type: 'stack', children: [{ type: 'qr', value: '{{url}}' }, { type: 'diagram', code: 'graph TD; a-->b' }] } }))
  await rig.rpc('widgetReload')
  await rig.rpc('widgetSet', { id: 'phone', on: true })
  await rig.rpc('widgetRun', { id: 'phone' })
  const html: string = await until(async () => (h => h.includes('k-qr') && h)(await rig.rpc('widgetRender', { id: 'phone', full: true })), 'its fetch drawn')
  assert.match(html, /<svg class="k-qr/)
  assert.ok(html.includes('aria-label="QR code: https://example.com/p"'))
  assert.match(html, /<code>graph TD; a--&gt;b<\/code>/)
})
