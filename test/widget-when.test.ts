// P2: when an extension shows: widget.json's when, the store's over it, checked against the selected workspace
import { strict as assert } from 'node:assert'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { whenOk } from '../src/shared/widgetSchema.ts'
import { fresh } from './helpers.ts'

test('whenOk: a project by id or name, a branch glob, a PR or none, its agents', () => {
  const ws = { project: 'p1', branch: 'feat/login', pr: { number: 3 } }
  assert.equal(whenOk(undefined, undefined), true, 'no when: always')
  assert.equal(whenOk({ pr: true }, undefined), false, 'a when with no workspace: hidden')
  assert.equal(whenOk({ project: 'p1' }, ws), true)
  assert.equal(whenOk({ project: 'Shop' }, ws, { projectName: 'shop' }), true, 'by name')
  assert.equal(whenOk({ project: 'other' }, ws, { projectName: 'shop' }), false)
  assert.equal(whenOk({ branch: 'feat/*' }, ws), true)
  assert.equal(whenOk({ branch: 'fix/*' }, ws), false)
  assert.equal(whenOk({ pr: false }, ws), false)
  assert.equal(whenOk({ pr: false }, { project: 'p1' }), true)
  assert.equal(whenOk({ agent: 'waiting' }, ws, { agents: ['idle', 'waiting'] }), true)
  assert.equal(whenOk({ agent: 'idle' }, ws, { agents: ['idle', 'waiting'] }), false, 'idle: none at work or asking')
  assert.equal(whenOk({ agent: 'idle' }, ws, { agents: ['idle'] }), true)
  assert.equal(whenOk({ agent: 'idle' }, ws, { agents: [] }), false, 'no agent')
})

test("widget.json's when in the view, the store's over it: {} always, null widget.json's again; Check checks it", async t => {
  const rig = await fresh(t)
  const d = join(rig.data, 'widgets', 'w')
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'widget.json'), JSON.stringify({ name: 'W', when: { pr: true, branch: 'feat/*' }, ui: { type: 'text', value: 'x' } }))
  await rig.rpc('widgetReload')
  const view = async () => (await rig.rpc('state')).widgets.find((w: any) => w.id === 'w')
  assert.deepEqual((await view()).when, { pr: true, branch: 'feat/*' })
  await rig.rpc('widgetSet', { id: 'w', when: { agent: 'waiting', nope: 1 } })
  assert.deepEqual((await view()).when, { agent: 'waiting' }, 'the store wins, its known keys only')
  await rig.rpc('widgetSet', { id: 'w', when: {} })
  assert.equal((await view()).when, undefined, 'none set: always')
  await rig.rpc('widgetSet', { id: 'w', when: null })
  assert.deepEqual((await view()).when, { pr: true, branch: 'feat/*' }, "null: widget.json's again")
  writeFileSync(join(d, 'widget.json'), JSON.stringify({ name: 'W', when: { pr: 'yes', agent: 'busy', bran: 'x' }, ui: { type: 'text', value: 'x' } }))
  await rig.rpc('widgetReload')
  const p = (await rig.rpc('widgetCheck', { id: 'w' })).problems.filter((x: any) => x.where.startsWith('widget.json when'))
  assert.deepEqual(p.map((x: any) => `${x.level} ${x.where}`).sort(), ['error widget.json when.agent', 'error widget.json when.pr', 'warn widget.json when'])
})
