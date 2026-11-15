// C1: Make a tile from this command: an extension, off, from a shell tab's selection or its last OSC 133-marked command
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { shapeOf, uiFor as ui } from '../src/shared/widgetStarters.ts'
import { fresh, until } from './helpers.ts'

const find = async (rig: any, id: string) => (await rig.rpc('state')).widgets?.find((w: any) => w.id === id)

test('from a selection: its first line the command (a prompt dropped), the rest its sample; off, and it runs where it ran', async t => {
  const rig = await fresh(t)
  const p = await rig.rpc('projectAdd', { path: rig.repo })
  const w = await rig.rpc('wsNew', { project: p.id, preset: 'shell', name: 'sh' })
  const shell = await until(() => rig.tab(w.id, 'shell'), 'the shell tab')
  await until(async () => (await rig.screen(shell.id)).includes('$'), 'its prompt')
  const cmd = `printf '[{"name":"a","n":1},{"name":"b","n":2}]'`
  const r = await rig.rpc('widgetFromTerm', { tab: shell.id, text: `$ ${cmd}\n[{"name":"a","n":1},{"name":"b","n":2}]\n` })
  assert.equal(r.cmd, cmd)
  const m = JSON.parse(readFileSync(join(r.dir, 'widget.json'), 'utf8'))
  assert.deepEqual(m.sample, [{ name: 'a', n: 1 }, { name: 'b', n: 2 }])
  assert.equal(m.ui.type, 'table')
  assert.deepEqual(m.ui.columns.map((c: any) => c.title), ['name', 'n'])
  assert.equal(m.script, 'fetch.mjs')
  assert.match(m.description, /^From a terminal: printf/)
  assert.equal((await find(rig, r.id)).on, false, 'made off')
  assert.equal((await rig.rpc('widgetRun', { id: r.id, once: true })).ok, true, 'Try it live')
  assert.deepEqual(JSON.parse(readFileSync(join(rig.data, 'widget-data', `${r.id}.json`), 'utf8')).data, [{ name: 'a', n: 1 }, { name: 'b', n: 2 }])
  await assert.rejects(rig.rpc('widgetFromTerm', { tab: shell.id }), /select the command/, 'no marks, no selection')
  // the agent can't
  const agent = await rig.rpc('wsNew', { project: p.id, preset: 'claude', prompt: 'hi', name: 'ag' })
  const at = await until(() => rig.tab(agent.id), 'its agent tab')
  await assert.rejects(rig.rpc('widgetFromTerm', { tab: shell.id, text: 'ls\nx', from: { ws: agent.id, tab: (at as any).id } }), /it's the user's/)
})

test("from the shell's marks: OSC 133's last finished command and what it printed", async t => {
  const rig = await fresh(t)
  const p = await rig.rpc('projectAdd', { path: rig.repo })
  const w = await rig.rpc('wsNew', { project: p.id, preset: 'shell', name: 'sh' })
  const shell = await until(() => rig.tab(w.id, 'shell'), 'the shell tab')
  await until(async () => (await rig.screen(shell.id)).includes('$'), 'its prompt')
  // what a shell with shell integration prints around a command: B, the command, C, its output, D
  await rig.rpc('input', { tab: shell.id, data: "printf '\\033]133;B\\007echo 42\\r\\n\\033]133;C\\00742\\r\\n\\033]133;D;0\\007'\r" })
  const r = await until(() => rig.rpc('widgetFromTerm', { tab: shell.id }).catch(() => undefined), 'its marks read')
  assert.equal((r as any).cmd, 'echo 42')
  const m = JSON.parse(readFileSync(join((r as any).dir, 'widget.json'), 'utf8'))
  assert.equal(m.sample, 42)
  assert.deepEqual(m.ui, { type: 'stat', value: '{{data}}', label: 'echo 42' })
})

test('shapeOf and uiFor: JSON as it is, else lines; a table, a stat, a list', () => {
  assert.deepEqual(shapeOf('a\n\nb  \n'), { lines: ['a', 'b'] })
  assert.equal(shapeOf(' 7 '), 7)
  assert.equal((ui as (d: unknown, l: string) => any)({ lines: ['x'] }, 'l').type, 'list')
  assert.deepEqual(ui({ count: 3 }, 'c'), { type: 'stat', value: '{{count}}', label: 'count' })
  assert.equal((ui as (d: unknown, l: string) => any)({ a: 1, b: 'x' }, 'o').type, 'json')
  assert.equal((ui as (d: unknown, l: string) => any)(['a', 'b'], 'p').type, 'list')
})
