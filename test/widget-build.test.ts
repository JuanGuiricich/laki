// C2–C4: the paths an element reads (the builder's hover links), and an extension made from the UI kit's card
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { readsOf } from '../src/shared/widgetUi.ts'
import { fresh, until } from './helpers.ts'

test('readsOf: templates and path props, under its each; not Laki’s own names', () => {
  assert.deepEqual(readsOf({ type: 'list', each: 'prs', title: '#{{number}} {{title}}', subtitle: '{{ago updated}} · {{config.repo}}', accessories: [{ tag: '{{ci}}' }] }).reads.sort(), ['prs', 'prs.*.ci', 'prs.*.number', 'prs.*.title', 'prs.*.updated'])
  assert.deepEqual(readsOf({ type: 'stat', value: '{{num visits}}', label: 'visits', spark: 'week' }).reads.sort(), ['visits', 'week'])
  assert.deepEqual(readsOf({ type: 'text', value: '{{#if open}}{{open}} open{{else}}none{{/if}} {{at}}' }).reads, ['open'])
  const outer = readsOf({ type: 'stack', each: 'teams' })
  assert.equal(outer.scope, 'teams.*')
  assert.deepEqual(readsOf({ type: 'text', value: '{{name}} {{this}}' }, outer.scope).reads.sort(), ['teams.*', 'teams.*.name'])
  assert.deepEqual(readsOf({ type: 'json', value: 'data.ci' }).reads, ['ci'])
})

test("the UI kit's Make an extension from this: its ui over its sample, a static source; yours", async t => {
  const rig = await fresh(t)
  const ui = { type: 'stat', value: '{{n}}', label: 'open' }
  const r = await rig.rpc('widgetNew', { name: 'Stat', ui, sample: { n: 4 } })
  const m = JSON.parse(readFileSync(join(r.dir, 'widget.json'), 'utf8'))
  assert.deepEqual(m.ui, ui)
  assert.deepEqual(m.source, { kind: 'static', text: '{"n":4}' })
  await until(async () => JSON.parse(readFileSync(join(rig.data, 'widget-data', `${r.id}.json`), 'utf8')).data?.n === 4, 'its data: the sample')
  await assert.rejects(rig.rpc('widgetNew', { name: 'Bad', ui: 'nope' }), /ui: an element/)
  // the builder's save: widget.json written by hand, a history snapshot first (Undo)
  const was = readFileSync(join(r.dir, 'widget.json'), 'utf8')
  const next = JSON.stringify({ ...m, ui: { type: 'stack', children: [ui, { type: 'text', value: 'more' }] } }, null, 2)
  await rig.rpc('widgetFileSave', { id: r.id, path: 'widget.json', text: next, was })
  assert.equal(readFileSync(join(r.dir, 'widget.json'), 'utf8'), next)
  await rig.rpc('widgetUndo', { id: r.id })
  assert.equal(readFileSync(join(r.dir, 'widget.json'), 'utf8'), was, 'Undo puts it back')
})
