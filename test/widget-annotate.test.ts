// P6: extensions' notes on diff lines: an action's JSON or a fetch's data with annotations, checked (inside the
// workspace, 500 at most), kept per workspace and extension until a run that says them again, gone when it's off
import { strict as assert } from 'node:assert'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fresh, until } from './helpers.ts'

test('annotations: kept per workspace, checked and capped, replaced by a run that says them, gone when off', async t => {
  const rig = await fresh(t)
  const p = await rig.rpc('projectAdd', { path: rig.repo })
  const w = await rig.rpc('wsNew', { project: p.id, preset: 'shell', name: 'sh' })
  const ws = (await rig.rpc('state')).workspaces.find((x: any) => x.id === w.id)
  const dir = join(rig.data, 'widgets', 'lint')
  mkdirSync(dir, { recursive: true })
  const notes = (list: unknown) => `cat <<'EOF'\n${JSON.stringify({ annotations: list })}\nEOF`
  writeFileSync(
    join(dir, 'widget.json'),
    JSON.stringify({
      name: 'Lint',
      scope: 'workspace',
      annotates: true,
      every: 1440,
      // its notes only on a fetch by hand: the one an action asks for after it says none (its notes stay)
      fetch: `[ "$LAKI_REFRESH_REASON" = manual ] && printf '{"n": 1, "annotations": [{"file": "b.ts", "line": 2, "level": "error", "text": "from the fetch"}]}' || echo '{"n": 2}'`,
      actions: {
        // a relative one, an absolute one inside it; refused: outside it, line 0, no text, not an object
        mixed: notes([{ file: 'src/a.ts', line: 3, level: 'warn', text: 'unused import', fix: 'remove it' }, { file: join(ws.path, 'src/b.ts'), line: 7, text: 'abs' }, { file: '../out.ts', line: 1, text: 'x' }, { file: '/etc/hosts', line: 1, text: 'x' }, { file: 'a.ts', line: 0, text: 'x' }, { file: 'a.ts', line: 1 }, 'nope']),
        many: notes(Array.from({ length: 600 }, (_, i) => ({ file: 'src/a.ts', line: i + 1, text: `n${i}` }))),
        none: `printf '{"toast": "hi"}'`,
        clear: notes([]),
      },
    }),
  )
  await rig.rpc('widgetReload')
  await rig.rpc('widgetSet', { id: 'lint', on: true })
  const list = () => rig.rpc('widgetAnnotations', { ws: w.id })
  const at = async () => (await rig.rpc('state')).workspaces.find((x: any) => x.id === w.id)?.annotAt
  // a fetch: its data's
  await until(async () => (await rig.rpc('widgetRun', { id: 'lint', ws: w.id })).ok, 'its fetch')
  assert.deepEqual(await list(), [{ widget: 'lint', name: 'Lint', items: [{ file: 'b.ts', line: 2, level: 'error', text: 'from the fetch' }] }])
  assert.ok(await at(), 'the view says when they changed')
  const run = (action: string) => rig.rpc('widgetAction', { id: 'lint', action, ws: w.id })
  assert.equal((await run('mixed')).ok, true)
  assert.deepEqual((await list())[0].items, [{ file: 'src/a.ts', line: 3, level: 'warn', text: 'unused import', fix: 'remove it' }, { file: 'src/b.ts', line: 7, level: 'info', text: 'abs' }])
  await run('none')
  assert.equal((await list())[0].items.length, 2, 'an action without them leaves them')
  await run('many')
  assert.equal((await list())[0].items.length, 500, '500 at most')
  await run('clear')
  assert.deepEqual(await list(), [], '[] clears them')
  await run('mixed')
  const was = await at()
  await rig.rpc('widgetSet', { id: 'lint', on: false })
  assert.deepEqual(await list(), [], 'off: gone')
  assert.ok((await at()) > was, 'and the view says so')
  assert.equal((await rig.rpc('state')).widgets.find((x: any) => x.id === 'lint').annotates, true)
})
