// R1: a failed fetch's kind (missing-bin, offline, auth, rate-limit, timeout, bad-json, exit) and its hint, on the run
// and the store; an offline one keeps its data, backs off nothing and isn't marked failing
import { strict as assert } from 'node:assert'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fresh, until } from './helpers.ts'

const store = (rig: any, id: string) => JSON.parse(readFileSync(join(rig.data, 'widget-data', `${id}.json`), 'utf8'))
const find = async (rig: any, id: string) => (await rig.rpc('state')).widgets?.find((w: any) => w.id === id)

test('each kind of failure is named, with a hint and its fix; offline keeps the data and its backoff', async t => {
  const rig = await fresh(t, { env: { LAKI_WIDGET_TIMEOUT_MS: '1500' } })
  const d = join(rig.data, 'widgets', 'k')
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'widget.json'), JSON.stringify({ name: 'K', fetch: 'sh ./run.sh', sample: { n: 1 }, ui: { type: 'stat', value: '{{n}}' } }))
  const run = async (sh: string) => {
    writeFileSync(join(d, 'run.sh'), sh)
    await until(async () => !(await find(rig, 'k')).running, 'no fetch running')
    await rig.rpc('widgetRun', { id: 'k' })
    return { s: store(rig, 'k'), r: (await rig.rpc('widgetRuns', { id: 'k' })).runs[0] }
  }
  await rig.rpc('widgetReload')
  await rig.rpc('widgetSet', { id: 'k', on: true })
  const good = await run('echo \'{"n": 7}\'')
  assert.equal(good.s.fail, undefined)
  const cases: [string, string, RegExp, string?][] = [
    ['nosuchbin-laki-x', 'missing-bin', /nosuchbin-laki-x isn’t installed/, 'brew install nosuchbin-laki-x'],
    ["echo 'To get started with GitHub CLI, please run:  gh auth login' >&2; exit 4", 'auth', /gh isn’t signed in/, 'gh auth login'],
    ["echo 'HTTP 429: API rate limit exceeded' >&2; exit 1", 'rate-limit', /rate limit/i],
    ['echo not json at all', 'bad-json', /isn’t JSON/],
    ['sleep 5', 'timeout', /too long/],
    ['exit 3', 'exit', /exit 3/],
  ]
  for (const [sh, kind, hint, cmd] of cases) {
    const { s, r } = await run(sh)
    assert.equal(s.fail?.kind, kind, sh)
    assert.match(s.fail.hint, hint)
    assert.equal(s.fail.cmd, cmd)
    assert.equal(r.kind, kind)
    assert.equal(r.hint, s.fail.hint)
    assert.deepEqual(s.data, { n: 7 }, 'the last data kept')
  }
  assert.equal(store(rig, 'k').fails, cases.length, 'each counted: backs off')
  const bad = await run('echo \'{"a": 1,}\'')
  assert.match(bad.s.error, /fetch printed no JSON \(at position \d+\): \{"a": 1,\}/, 'where it stopped, what it printed')
  // offline: no backoff, not failing, the data's age kept
  await run('echo \'{"n": 8}\'')
  const at = store(rig, 'k').at
  const off = await run("echo 'curl: (6) Could not resolve host: api.example.com' >&2; exit 6")
  assert.equal(off.s.fail.kind, 'offline')
  assert.equal(off.s.fail.since, at, 'its data is as old as its last good fetch')
  assert.equal(off.s.fails, undefined, 'no backoff')
  const again = await run("echo 'error connecting to api.github.com' >&2; exit 1")
  assert.equal(again.s.fail.since, at, 'still as old')
  assert.equal(again.s.fails, undefined)
  assert.deepEqual(again.s.data, { n: 8 })
  const v = await find(rig, 'k')
  assert.equal(v.fail.kind, 'offline', 'the view has it')
  assert.equal(v.logErr, undefined, 'no error line in its log: Settings marks it failing on one')
  const html = await rig.rpc('widgetRender', { id: 'k' })
  assert.match(html, /8/, 'drawn over its last data')
  await run('echo \'{"n": 9}\'')
  assert.equal(store(rig, 'k').fail, undefined, 'a good fetch clears it')
  assert.equal((await find(rig, 'k')).fail, undefined)
})

test("a failure with no data: the error block shows the hint and its fix, the raw error in its tooltip", async t => {
  const rig = await fresh(t)
  const d = join(rig.data, 'widgets', 'n')
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'widget.json'), JSON.stringify({ name: 'N', fetch: "echo 'To get started with GitHub CLI, please run:  gh auth login' >&2; exit 4", sample: { n: 1 }, ui: { type: 'stat', value: '{{n}}' } }))
  await rig.rpc('widgetReload')
  await rig.rpc('widgetSet', { id: 'n', on: true })
  await until(async () => (await find(rig, 'n'))?.error, 'its first fetch failed')
  const html: string = await rig.rpc('widgetRender', { id: 'n' })
  assert.match(html, /gh isn’t signed in/)
  assert.match(html, /data-laki="fix">Sign in</)
  assert.match(html, /title="[^"]*gh auth login/)
  // an action's failure says its kind on the run and its hint back
  writeFileSync(join(d, 'widget.json'), JSON.stringify({ name: 'N', fetch: 'echo \'{"n": 1}\'', actions: { go: 'jq-nope-laki .' }, ui: { type: 'stat', value: '{{n}}' } }))
  await rig.rpc('widgetReload')
  await until(async () => !(await find(rig, 'n')).running, 'no fetch running')
  const r = await rig.rpc('widgetAction', { id: 'n', action: 'go' })
  assert.equal(r.ok, false)
  assert.equal(r.fail?.kind, 'missing-bin')
  assert.equal((await rig.rpc('widgetRuns', { id: 'n' })).runs[0].kind, 'missing-bin')
})
