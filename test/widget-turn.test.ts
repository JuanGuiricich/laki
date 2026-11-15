// P5: the turn place: a turn.done handler's data kept per tab and turn (the last 20), its face in the tab's view, its
// full view drawn on that turn's data; the turn starter
import { strict as assert } from 'node:assert'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { manifestCheck } from '../src/shared/widgetSchema.ts'
import { STARTERS } from '../src/shared/widgetStarters.ts'
import { fresh, until } from './helpers.ts'

test('a turn place extension: each turn.done fetch a chip on that tab, its data drawn for that turn; 20 kept', async t => {
  const rig = await fresh(t)
  const dir = join(rig.data, 'widgets', 'turny')
  mkdirSync(dir, { recursive: true })
  // each fetch: one more than the last (a file in its folder), its tone bad past 2
  writeFileSync(join(dir, 'fetch.sh'), 'n=$(( $(cat n 2>/dev/null || echo 0) + 1 )); echo $n > n; printf \'{"n": %s, "tone": "%s"}\' $n $([ $n -gt 2 ] && echo bad || echo good)\n')
  writeFileSync(join(dir, 'widget.json'), JSON.stringify({ name: 'Turny', scope: 'workspace', place: 'turn', every: 1440, on: { 'turn.done': 'refresh' }, fetch: 'sh fetch.sh', label: 'n {{n}}', badge: '{{n}}', ui: { type: 'stat', value: '{{n}}', label: 'turn' } }))
  await rig.rpc('widgetReload')
  const p = await rig.rpc('projectAdd', { path: rig.repo })
  const w = await rig.rpc('wsNew', { project: p.id, preset: 'claude', prompt: 'hi', name: 'ag' })
  const tab: any = await until(() => rig.tab(w.id), 'its agent tab')
  await rig.rpc('widgetSet', { id: 'turny', on: true })
  const marks = async () => (await rig.rpc('state')).tabs.find((x: any) => x.id === tab.id)?.marks ?? []
  const done = () => rig.rpc('hook', { tab: tab.id, state: 'idle', payload: { last_assistant_message: 'done' } })
  await done()
  const one = await until(async () => (m => m.length === 1 && m)(await marks()), 'the first turn’s chip')
  assert.equal(one[0].widget, 'turny')
  assert.ok(one[0].label?.startsWith('n '), 'its face: label from its data')
  assert.equal(one[0].data, undefined, 'its data stays in the daemon')
  const first = one[0]
  for (let i = 0; i < 21; i++) {
    const last = (await marks()).at(-1).at
    await rig.rpc('hook', { tab: tab.id, state: 'running', payload: { prompt: `go ${i}` } })
    await done()
    await until(async () => (await marks()).at(-1).at > last, `turn ${i + 2}'s chip`)
  }
  const all = await marks()
  assert.equal(all.length, 20, 'the last 20 turns')
  assert.ok(!all.some((m: any) => m.at === first.at), 'the oldest went')
  assert.equal(all.at(-1).tone, 'bad', 'its data’s tone')
  // its full view: that turn's data, not the last
  const html = await rig.rpc('widgetRender', { id: 'turny', full: true, turn: { tab: tab.id, at: all[0].at } })
  assert.match(html, new RegExp(`>${all[0].badge}<`))
  await assert.rejects(rig.rpc('widgetRender', { id: 'turny', turn: { tab: tab.id, at: first.at } }), /that turn's data is gone/)
  // a place for per workspace ones only
  const g = await rig.rpc('widgetNew', { name: 'App wide', ui: { type: 'text', value: 'x' }, sample: {} })
  await assert.rejects(rig.rpc('widgetSet', { id: g.id, place: 'turn' }), /per workspace/)
})

test('the turn starter: per workspace, its turn.done a refresh; widget.json checks', () => {
  const m = JSON.parse(STARTERS.turn.files('t', 'T')['widget.json'])
  assert.deepEqual([m.scope, m.place, m.on['turn.done']], ['workspace', 'turn', 'refresh'])
  assert.deepEqual(manifestCheck(m).filter(p => p.level === 'error'), [])
  assert.match(JSON.stringify(manifestCheck({ ...m, scope: undefined })), /needs \\"scope\\": \\"workspace\\"/)
  assert.match(JSON.stringify(manifestCheck({ ...m, on: undefined })), /turn\.done/)
})
