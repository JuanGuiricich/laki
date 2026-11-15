// K1: the UI kit's term element: its key and HTML (a slot, the command as its fallback), the daemon's terminal for it
// (started once, attached, in Resources, stopped by Stop, by off and when nobody looked for 10 minutes), its gates
import { strict as assert } from 'node:assert'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { termKey, termsOf, uiCheck, uiHtml } from '../src/shared/widgetUi.ts'
import { fresh, until } from './helpers.ts'

test('term: its key, every one in a ui, its HTML a slot with the command; the check', () => {
  assert.equal(termKey('top'), termKey('top', ''))
  assert.notEqual(termKey('top'), termKey('top', 'src'))
  assert.match(termKey('x'), /^[0-9a-f]{8}$/)
  assert.deepEqual(termsOf({ preview: { type: 'stat', value: '1' }, full: { type: 'stack', children: [{ type: 'term', run: 'top' }, { type: 'term', run: 'ls', cwd: 'src' }, { type: 'term', run: ' ' }] } }), [{ run: 'top' }, { run: 'ls', cwd: 'src' }])
  const html = uiHtml({ type: 'term', run: 'echo <hi>' }, {}, {})
  assert.match(html, new RegExp(`data-term="${termKey('echo <hi>')}"[^>]*><slot name="term-${termKey('echo <hi>')}"><pre class="k-term-cmd"><code>\\$ echo &lt;hi&gt;</code>`))
  assert.match(html, /height:182px/, '10 lines in a cell')
  assert.match(uiHtml({ type: 'term', run: 'x', rows: 4 }, {}, { full: true }), /height:80px/)
  assert.match(JSON.stringify(uiCheck({ type: 'term' })), /its run/)
  assert.match(JSON.stringify(uiCheck({ type: 'term', run: 'echo {{data.x}}' })), /isn’t filled/)
})

test('a term element’s terminal: started once and attached, in Resources, stopped by Stop, off and nobody looking; the gates', async t => {
  const rig = await fresh(t)
  const d = join(rig.data, 'widgets', 'tt')
  mkdirSync(d, { recursive: true })
  const run = 'echo "hello from $LAKI_WIDGET"; sleep 60'
  writeFileSync(join(d, 'widget.json'), JSON.stringify({ name: 'TT', ui: { type: 'term', run } }))
  await rig.rpc('widgetReload')
  const key = termKey(run)
  await assert.rejects(rig.rpc('widgetTerm', { id: 'tt', key }), /off/i, 'off: none')
  assert.match((await rig.rpc('widgetWhat', { id: 'tt' })).text, /Its terminals run these[^]*sleep 60/, 'the turn-on sheet says what it runs')
  await rig.rpc('widgetSet', { id: 'tt', on: true })
  await assert.rejects(rig.rpc('widgetTerm', { id: 'tt', key: 'deadbeef' }), /has no terminal deadbeef/, 'only one widget.json has')
  const { tab } = await rig.rpc('widgetTerm', { id: 'tt', key })
  assert.equal((await rig.rpc('widgetTerm', { id: 'tt', key })).tab, tab, 'the same one again')
  const app = await rig.connect()
  t.after(() => app.ws.close())
  await until(async () => (await app.call('attach', { tab, cols: 80, rows: 10 })).snapshot.includes('hello from tt'), 'its output, attached')
  const cell = await rig.connect()
  t.after(() => cell.ws.close())
  assert.equal((await cell.call('attach', { tab, cols: 40, rows: 5, ro: true })).responder, false, 'a cell, shown only: never the one that answers its queries')
  assert.ok(!cell.events.some((m: any) => m.ev === 'responder' && m.tab === tab && m.on), 'nor told it is')
  cell.ws.close()
  const row = async () => ((await rig.rpc('resources')).others ?? []).find((o: any) => o.stop === `term:${tab}`)
  assert.match((await until(row, 'its row in Resources')).name, /^TT: echo/)
  await rig.rpc('resourceStop', { key: `term:${tab}` })
  assert.equal(await row(), undefined, 'Stop: gone')
  // started again; off stops it
  await rig.rpc('widgetTerm', { id: 'tt', key })
  await until(row, 'started again')
  await rig.rpc('widgetSet', { id: 'tt', on: false })
  await until(async () => !(await row()), 'off: stopped')
  // nobody looking for 10 minutes: stopped (this window still attached keeps it)
  await rig.rpc('widgetSet', { id: 'tt', on: true })
  const again = (await rig.rpc('widgetTerm', { id: 'tt', key })).tab
  await app.call('attach', { tab: again, cols: 80, rows: 10 })
  await rig.rpc('widgetTick', { now: Date.now() + 11 * 60_000 })
  assert.ok(await row(), 'a window attached: kept')
  app.ws.close()
  let later = 11
  await until(async () => {
    await rig.rpc('widgetTick', { now: Date.now() + (later += 11) * 60_000 }) // each 11 minutes on: a tick before the window's close was heard saw it looked at
    return !(await row())
  }, 'stopped once nobody looked for 10 minutes')
  // never an agent's
  const p = await rig.rpc('projectAdd', { path: rig.repo })
  const w = await rig.rpc('wsNew', { project: p.id, preset: 'claude', prompt: 'hi', name: 'ag' })
  const at: any = await until(() => rig.tab(w.id), 'its agent tab')
  await assert.rejects(rig.rpc('widgetTerm', { id: 'tt', key, from: { ws: w.id, tab: at.id } }), /start an extension's terminal/)
})
