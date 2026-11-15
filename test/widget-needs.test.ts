// R2: widget.json's needs: its programs looked for on the PATH its commands get, a Laki too old never runs it, and the
// checker asks for the programs its commands run
import { strict as assert } from 'node:assert'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { binsIn } from '../src/shared/widgetSchema.ts'
import { fresh } from './helpers.ts'

const make = (rig: any, id: string, m: object) => {
  mkdirSync(join(rig.data, 'widgets', id), { recursive: true })
  writeFileSync(join(rig.data, 'widgets', id, 'widget.json'), JSON.stringify(m))
}
const find = async (rig: any, id: string) => (await rig.rpc('state')).widgets?.find((w: any) => w.id === id)

test('needs.bins: each looked for on its PATH, again as it is turned on; needs.laki newer than this build: never run', async t => {
  const rig = await fresh(t)
  make(rig, 'j', { name: 'J', fetch: 'echo "{}" | jqlaki .', needs: { bins: ['jqlaki', 'sh'] }, sample: {}, ui: { type: 'text', value: 'x' } })
  make(rig, 'new', { name: 'New', fetch: 'echo "{}"', needs: { laki: '99.0' }, sample: {}, ui: { type: 'text', value: 'x' } })
  await rig.rpc('widgetReload')
  let j = await find(rig, 'j')
  assert.deepEqual(j.needs, ['jqlaki', 'sh'])
  assert.deepEqual(j.missingBins, ['jqlaki'], 'sh is there, jqlaki not')
  const bin = join(rig.env.HOME, 'bin', 'jqlaki')
  writeFileSync(bin, '#!/bin/sh\ncat\n')
  chmodSync(bin, 0o755)
  await rig.rpc('widgetSet', { id: 'j', on: true })
  j = await find(rig, 'j')
  assert.equal(j.missingBins, undefined, 'looked for again as it was turned on')
  const n = await find(rig, 'new')
  assert.match(n.tooNew, /needs Laki 99\.0 or newer: this is \d/)
  await assert.rejects(rig.rpc('widgetSet', { id: 'new', on: true }), /New needs Laki 99\.0 or newer/)
  assert.equal((await rig.rpc('widgetRun', { id: 'new' })).ok, false, 'never run')
  // one file: <laki.needs>
  writeFileSync(join(rig.data, 'widgets', 'one.5m.sh'), '#!/bin/sh\n# <laki.needs>ghlaki jq laki 0.1</laki.needs>\n# <laki.sample>{}</laki.sample>\necho "{}"\n')
  chmodSync(join(rig.data, 'widgets', 'one.5m.sh'), 0o755)
  await rig.rpc('widgetReload')
  const one = await find(rig, 'one')
  assert.deepEqual(one.needs, ['ghlaki', 'jq'])
  assert.ok(one.missingBins.includes('ghlaki'))
  assert.equal(one.tooNew, undefined, 'laki 0.1: any build')
})

test('the checker warns at a program its commands run that needs.bins leaves out', async t => {
  const rig = await fresh(t)
  make(rig, 'c', { name: 'C', fetch: 'FOO=1 gh pr list --json n --jq ".[] | .n" | jq -s . && echo done', actions: { open: { run: 'cd x; python3 go.py' } }, needs: { bins: ['gh'] }, sample: {}, ui: { type: 'text', value: 'x' } })
  await rig.rpc('widgetReload')
  const { problems } = await rig.rpc('widgetCheck', { id: 'c' })
  const warns = problems.filter((p: any) => p.where.endsWith('needs') && p.level === 'warn').map((p: any) => p.text.split(':')[0])
  assert.deepEqual(warns.sort(), ['jq', 'python3'], 'gh listed; cd, echo builtins; .n in quotes skipped')
  assert.ok(!problems.some((p: any) => p.level === 'error'))
  make(rig, 'b', { name: 'B', needs: { bins: ['no way'], laki: 'soon' }, ui: { type: 'text', value: 'x' } })
  await rig.rpc('widgetReload')
  const b = (await rig.rpc('widgetCheck', { id: 'b' })).problems.filter((p: any) => p.level === 'error').map((p: any) => p.where)
  assert.deepEqual(b, ['widget.json needs.bins', 'widget.json needs.laki'])
})

test('binsIn: each segment’s first word, past assignments and sudo; not builtins, paths or what every Mac has', () => {
  assert.deepEqual(binsIn('A=1 B=2 jq . | sudo rg x && ./run.sh; $LAKI_CLI x; cat f | yq'), ['jq', 'rg', 'yq'])
  assert.deepEqual(binsIn('echo "$(node -v)" `deno --version`'), ['node', 'deno'])
  assert.deepEqual(binsIn('if test -f x; then gh api y; fi'), ['gh'])
})
