// P3: Edit layout's changes: an extension's order among the others (kept, clamped, cleared), its places and size
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { fresh } from './helpers.ts'

test('widgetSet order: kept and in the view, rounded and clamped, null clears it; a move of places and a resize', async t => {
  const rig = await fresh(t)
  const a = await rig.rpc('widgetNew', { name: 'A', ui: { type: 'text', value: 'a' }, sample: {} })
  const find = async () => (await rig.rpc('state')).widgets.find((w: any) => w.id === a.id)
  assert.equal((await find()).order, undefined, 'none: as listed')
  await rig.rpc('widgetSet', { id: a.id, order: 20.4 })
  assert.equal((await find()).order, 20)
  await rig.rpc('widgetSet', { id: a.id, order: 1e9 })
  assert.equal((await find()).order, 1e6, 'clamped')
  await rig.rpc('widgetSet', { id: a.id, order: null })
  assert.equal((await find()).order, undefined, 'null: back to as listed')
  await rig.rpc('widgetSet', { id: a.id, place: ['top', 'rail'], size: [3, 1] })
  const w = await find()
  assert.deepEqual(w.places ?? [w.place], ['top', 'rail'])
  assert.deepEqual(w.size, [3, 1])
})
