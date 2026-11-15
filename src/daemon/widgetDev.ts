// making an extension: its runs, mock data and fixtures, laki widget dev's linked folders, a new one from a starter,
// and the checker (laki widget check). widgets.ts re-exports it.

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { type WidgetRuns } from '../shared/types.ts'
import { actionCmd, binsIn, manifestCheck, needsOf, SECRET, toolOf } from '../shared/widgetSchema.ts'
import { LINES_MAX, shapeOf, STARTER_KINDS, type StarterKind, STARTERS, uiFor } from '../shared/widgetStarters.ts'
import { reservedIn, uiCheck, type UiProblem } from '../shared/widgetUi.ts'
import { agentRoots, binOn, configOf, dataOf, devRoots, type Entry, envOf, fetchable, find, foldersIn, guarded, home, htmlOf, idOf, isObj, keep, keyOf, type Manifest, manifestOf, metaOf, oneFile, onOf, optionsOf, pathOf, readStore, refetch, repoRoots, runs, RUNS, scanWidgets, scoped, type Source, sourceOf, sourceOk, stopAgents, storePath, templatesError, typedOf, under, whence, widgetHome, widgetRun, widgets, wLog, writeStore, wsEnv, wsOf } from './widgets.ts'
import { stopStream, streaming, streamOf, streamSync } from './widgetEvents.ts'
import { agentCaller, changed, sessions, settingsSet, shellCwd, state } from './core.ts'
import { filesIn, statOf } from './widgetFiles.ts'
import { ungrant } from './widgetTools.ts'
import { dir } from './dir.ts'

// the inspector's Runs and Env and laki widget dev's lines: the last runs, what a fetch is given (a secret, and a setting
// whose name says token, secret, key or password, masked, in $LAKI_WIDGET_CONFIG too), its fixtures (fixtures/<name>.json)
export function widgetRuns(o: { id: string; data?: boolean; ws?: string }): WidgetRuns {
  const w = find(o.id)
  const x = scoped(w) && !o.ws ? undefined : wsOf(w, o.ws) // a scope workspace one's instance; none: all of theirs (laki widget dev)
  const k = keyOf(w.id, x?.id)
  const list = scoped(w) && !x ? [...runs].flatMap(([r, l]) => (r.startsWith(`${w.id}@`) ? l : [])).sort((a, b) => b.at - a.at).slice(0, RUNS) : (runs.get(k) ?? [])
  const data = o.data ? JSON.stringify(dataOf(w, x?.id).data ?? null, null, 2) : undefined // the inspector's Data: its JSON (256 KB of it at most)
  const c = configOf(w, true)
  const masked = new Set(optionsOf(w).filter(x => (x.type === 'secret' || SECRET.test(x.key)) && c[x.key]).map(x => x.key))
  const env = Object.fromEntries(
    Object.entries(envOf(w, { LAKI_REFRESH_REASON: runs.get(k)?.[0]?.reason ?? 'schedule', ...wsEnv(w, x) }))
      .filter(([k]) => /^(WIDGET_|LAKI_)/.test(k) || k === 'PATH' || k === 'PORT')
      .map(([k, v]) => [k, k === 'LAKI_WIDGET_CONFIG' ? JSON.stringify(Object.fromEntries(Object.entries(typedOf(w, true)).map(([n, x]) => [n, masked.has(n) ? '••••' : x]))) : [...masked].some(n => k === `WIDGET_${n.toUpperCase()}`) ? '••••' : v])
      .sort(([a], [b]) => a.localeCompare(b)),
  )
  return { runs: list, env, fixtures: fixturesOf(w), devError: w.devError, mock: metaOf(w, x?.id).mock, ...(streaming(w) && { stream: streamOf(w.id) }), ...(data !== undefined && { data: data.length > 256 << 10 ? undefined : data, big: data.length > 256 << 10 || undefined }) }
}
export const fixtureNames = (d: string) => {
  try {
    return readdirSync(join(d, 'fixtures')).filter(n => /^[\w.-]+\.json$/.test(n)).sort()
  } catch {
    return []
  }
}
export const fixturesOf = (w: Entry) => (w.file ? [] : fixtureNames(w.dir).map(n => n.slice(0, -5)))

// sample data by hand (the inspector's Data): data, or a fixture of its folder's, kept as its data (mock: which), not
// fetched meanwhile (a schedule skips it); off: back to live, fetched now. Runs nothing, so an off one takes it too
export async function widgetMock(o: { id: string; data?: unknown; fixture?: string; off?: boolean; ws?: string }) {
  const w = find(o.id)
  const ws = wsOf(w, o.ws)?.id // a scope workspace one's instance
  if (o.off) {
    keep(w, ws, s => (s.mock = undefined))
    changed()
    return fetchable(w, ws) ? widgetRun({ id: w.id, ws }) : { ok: true }
  }
  let data: unknown
  let mock: string
  if (o.fixture !== undefined) {
    const n = String(o.fixture)
    if (!fixturesOf(w).includes(n)) throw new Error(`${w.m.name || w.id} has no fixtures/${n}.json`)
    try {
      data = JSON.parse(readFileSync(join(w.dir, 'fixtures', `${n}.json`), 'utf8'))
    } catch (e) {
      throw new Error(`fixtures/${n}.json: ${(e as Error).message}`)
    }
    mock = n
  } else if ('data' in o) (data = o.data), (mock = 'edited')
  else throw new Error('data, a fixture, or off')
  if (!ws) stopStream(w.id) // a stream: its last line kept now, not over this; streamSync starts it again once it's Live
  keep(w, ws, s => Object.assign(s, { data, at: Date.now(), error: undefined, mock }))
  wLog(w, `sample data: ${mock}${ws ? ` (${ws})` : ''}`)
  changed()
  return { ok: true, mock }
}

// laki widget dev: link a folder of your own code (a widget's, or a folder of them): kept in settings.widgetDev,
// scanned first and watched, its widgets turned on (you ran it on your own code) and fetched. off: unlink it (by its
// folder or a widget's id); list: the links
export function widgetDev(o: { folder?: string; off?: string; list?: boolean; from?: { ws?: string; tab?: string } }) {
  const links = () => devRoots().map(folder => ({ folder, widgets: [...widgets.values()].filter(w => w.dev && under(pathOf(w), folder)).map(w => ({ id: w.id, name: w.m.name || w.id, on: onOf(w), devError: w.devError })) }))
  if (o.list) return { links: links() }
  if (o.off !== undefined) {
    const t = String(o.off)
    const w = widgets.get(t)
    const folder = devRoots().find(r => (w?.dev && under(pathOf(w), r)) || r === resolve(home(t)))
    if (!folder) throw new Error(`${t} isn't linked (laki widget dev --list)`)
    settingsSet({ widgetDev: devRoots().filter(r => r !== folder), widgetDevAgent: agentRoots().filter(r => r !== folder) }, true)
    return { unlinked: folder, links: links() }
  }
  const folder = resolve(home(String(o.folder ?? '')))
  const found = foldersIn(folder)
  if (!o.folder || !found.length) throw new Error(`${folder} has no widget.json, nor folders with one`)
  const bad = found.map(x => [pathOf(x), x.file ? oneFile(x.d, x.file) : manifestOf(x.d)] as const).filter(([, m]) => typeof m === 'string')
  const agent = !!agentCaller(o.from) // an agent's link: its widgets off until you look at them, then off again as they change (N10; one that shadows an installed one too: they share its store); yours makes it yours again
  if (agent) {
    // over one you have installed it would share its store and secrets: refused; the others off before the scan, so none starts
    const yours = found.map(x => widgets.get(idOf(x))).find(w => w && !w.agentDev) // installed or your own dev link: only its own earlier link's may come again
    if (yours) throw new Error(`${folder} has ${yours.id}: it would cover your ${yours.m.name || yours.id} (its settings and secrets). Pick another id`)
    for (const x of found) if (statOf(storePath(idOf(x)))) writeStore(idOf(x), { ...readStore(idOf(x)), on: false })
  }
  const marks = agentRoots().filter(r => r !== folder)
  settingsSet({ widgetDev: [...new Set([...devRoots(), folder])], widgetDevAgent: agent ? [...marks, folder] : marks }, true) // scans: its widgets first, watched
  const mine = [...widgets.values()].filter(w => w.dev && under(pathOf(w), folder))
  for (const w of mine)
    if (onOf(w) === agent && !(guarded(w) && !agent)) { // a repo's stays off until you look (widgetWhat)
      writeStore(w.id, { ...readStore(w.id), on: !agent, ...(!agent && { changed: undefined }) })
      w.s = { ...w.s, on: !agent }
      if (agent) ungrant(w.id), stopAgents(w.id)
    }
  streamSync()
  changed()
  for (const w of mine) if (!w.devError) refetch(w, 'dev', 'linked')
  return { folder, widgets: mine.map(w => ({ id: w.id, name: w.m.name || w.id, on: onOf(w), devError: w.devError })), broken: bad.map(([d, m]) => `${d}: ${m}`), ...(agent && { note: 'linked, off: only the user turns them on (Settings › Extensions)' }) }
}

// laki widget new (Settings › Extensions › New ▾): a starter (widgetStarters.ts) in its own folder, <data>/widgets/<id>
// (dir: another, empty or new, which laki widget dev then links; a one-file one goes in the folder itself), the id from
// its name, made unique. The user's own (not by: 'ai'): on, and fetched at once; an agent's (N10): off, nothing run
// made: its files instead of a starter's (C1's, never over RPC: a function), and off (the user looks first)
export async function widgetNew(o: { kind?: string; name?: string; dir?: string; ui?: unknown; sample?: unknown; from?: { ws?: string; tab?: string } }, made?: { files: (id: string, name: string) => Record<string, string>; off?: boolean }) {
  // C4: the UI kit's Make an extension from this: its ui over its sample, the sample its data (a static source)
  if (!made && o.ui !== undefined) {
    if (!isObj(o.ui)) throw new Error('ui: an element ({ "type": … }) or { "preview", "full" }')
    const text = JSON.stringify(o.sample ?? {})
    if (text.length > 64 << 10) throw new Error('its sample: 64 KB at most')
    return widgetNew({ ...o, ui: undefined }, { files: (_id, n) => ({ 'widget.json': `${JSON.stringify({ name: n, source: { kind: 'static', text }, sample: o.sample ?? {}, ui: o.ui }, null, 2)}\n` }) })
  }
  const agent = !!agentCaller(o.from)
  const kind = String(o.kind ?? 'list') as StarterKind
  if (!STARTER_KINDS.includes(kind)) throw new Error(`a kind: ${STARTER_KINDS.join(', ')}`)
  const name = String(o.name ?? '').trim().slice(0, 60)
  if (!name) throw new Error('a name')
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/, '') || 'extension'
  const own = o.dir === undefined || !String(o.dir).trim()
  const taken = (id: string) => widgets.has(id) || existsSync(storePath(id)) || (own && (existsSync(join(widgetHome(), id)) || filesIn(widgetHome()).some(n => n.startsWith(`${id}.`))))
  let id = slug
  for (let n = 2; taken(id); n++) id = `${slug}-${n}`
  const files = made ? made.files(id, name) : STARTERS[kind].files(id, name)
  const folder = own ? (kind === 'onefile' ? widgetHome() : join(widgetHome(), id)) : resolve(home(String(o.dir).trim()))
  const there = statOf(folder)
  if (!own && there && (!there.isDirectory() || (kind !== 'onefile' && readdirSync(folder).length))) throw new Error(`${folder} isn't an empty folder: a new one, or one with nothing in it`)
  for (const [n, t] of Object.entries(files)) {
    const p = join(folder, n)
    if (statOf(p)) throw new Error(`${p} is there already`)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, t)
    chmodSync(p, t.startsWith('#!') ? 0o755 : 0o644)
  }
  const real = (d: string) => (statOf(d) ? realpathSync(d) : d)
  const repo = repoRoots().some(r => under(real(folder), real(r.root))) // in a repo's .laki/extensions: the repo's, off until you look
  if (!repo) writeStore(id, { on: !agent && !made?.off }) // yours, on (C1's: off)
  scanWidgets()
  const at = kind === 'onefile' ? join(folder, Object.keys(files)[0]) : folder
  const w = [...widgets.values()].find(x => pathOf(x) === at || (repo && real(pathOf(x)) === real(at))) // in a folder of your own: once laki widget dev links it; a repo's: <project>.<id>
  wLog({ id: w?.id ?? id }, made ? `made from a terminal's command in ${folder}` : `made from the ${kind} starter in ${folder}`)
  if (w && !repo && !agent && scoped(w)) refetch(w, 'manual', 'made')
  else if (w && !repo && !agent && fetchable(w)) await widgetRun({ id: w.id, reason: 'manual', why: 'made' })
  return { id: w?.id ?? id, dir: at, files: Object.keys(files), found: !!w, ...(repo && { repo }), ...(agent && !repo && { note: 'made off: only the user turns it on (Settings › Extensions)' }) }
}

// C1: Make a tile from this command (a shell tab's right click): the selection (its first line the command, the rest
// what it printed), else the tab's last command by its OSC 133 marks. Its script runs the command in the folder it ran
// in and returns JSON (what it printed, when that's JSON; else { lines }); the sample is the output read the same way;
// its ui by the data's shape: rows of objects a table of their keys, one number a stat, lines a list. Made off: its page
// shows it on the sample until you try it and turn it on
const PROMPT = /^(?:\S+@\S+(?:\s+\S+){0,2}\s*)?[$%#❯➜»]\s+/ // a prompt copied with it: $, %, ❯, user@host dir %
export async function widgetFromTerm(o: { tab?: string; text?: string; name?: string }) {
  const tab = state.tabs.find(t => t.id === o.tab && t.kind === 'shell')
  if (!tab) throw new Error('a terminal tab')
  const sel = typeof o.text === 'string' ? o.text.replace(/\r/g, '').trim() : ''
  const run = sel ? { cmd: sel.split('\n')[0], out: sel.split('\n').slice(1).join('\n') } : sessions.get(tab.id)?.lastRun
  if (!run) throw new Error('select the command and what it printed (its first line the command): this terminal marks no commands')
  const cmd = run.cmd.replace(PROMPT, '').trim().slice(0, 4000)
  if (!cmd || /[\n\0]/.test(cmd)) throw new Error('no command: its first line is the command')
  const cwd = (await shellCwd(tab.workspace, tab.id).catch(() => undefined)) ?? homedir()
  const sample = shapeOf(run.out)
  const name = String(o.name ?? '').trim() || cmd.split(/\s+/).slice(0, 3).join(' ').slice(0, 60)
  const bins = binsIn(cmd)
  const r = await widgetNew({ name }, {
    off: true,
    files: (_id, n) => ({
      'widget.json': `${JSON.stringify({ name: n, description: `From a terminal: ${cmd.slice(0, 200)}`, script: 'fetch.mjs', every: 5, sample, ui: uiFor(sample, n), ...(bins.length && { needs: { bins } }) }, null, 2)}\n`,
      'fetch.mjs': `// Made by Laki from a terminal's command: it runs the command where it ran, and returns what it printed as JSON
// (JSON as it is, else its lines). Edit COMMAND, or the shape below, as you like
import { execFileSync } from 'node:child_process'
const COMMAND = ${JSON.stringify(cmd)}
const CWD = ${JSON.stringify(cwd)}
export default () => {
  const out = execFileSync('/bin/sh', ['-c', COMMAND], { cwd: CWD, encoding: 'utf8', maxBuffer: 16 << 20, stdio: ['ignore', 'pipe', 'inherit'] })
  try {
    return JSON.parse(out.trim())
  } catch {
    return { lines: out.split('\\n').map(l => l.trimEnd()).filter(Boolean).slice(0, ${LINES_MAX}) }
  }
}
`,
    }),
  })
  return { ...r, cmd }
}

// laki widget check (the inspector's Check, MCP's laki_extension_check): what's wrong with an extension, by its id or a
// folder (a widget's, a one-file one, or a folder of them): widget.json (manifestCheck), widget.html's and ui's
// templates, ui (uiCheck) against its sample and each fixture, a one-file one's interval. run: its fetch once (manual,
// as Fetch now), the ui against what it printed; never one Laki AI wrote while it's off: the user looks at it first
export async function widgetCheck(o: { id?: string; dir?: string; run?: boolean; ws?: string; from?: { ws?: string; tab?: string } }): Promise<{ id?: string; problems: UiProblem[] }> {
  let srcs: Source[]
  if (o.id !== undefined) {
    const w = find(String(o.id))
    srcs = [{ d: w.dir, file: w.file }]
  } else {
    const d = resolve(home(String(o.dir ?? '')))
    srcs = o.dir ? foldersIn(d) : []
    if (!srcs.length) throw new Error(`${d} has no widget.json, nor folders with one`)
  }
  const problems: UiProblem[] = []
  for (const x of srcs) {
    const ps = await checkOne(x, !!o.run, o.ws || undefined, !!agentCaller(o.from))
    problems.push(...(srcs.length > 1 ? ps.map(p => ({ ...p, where: `${idOf(x)}: ${p.where}` })) : ps))
  }
  return { id: srcs.length === 1 ? ([...widgets.values()].find(w => pathOf(w) === pathOf(srcs[0]))?.id ?? idOf(srcs[0])) : undefined, problems }
}
// what a scope workspace one should use of its workspace, somewhere in its fetch, its files or its ui
const WS_USE = /\$\{?(LAKI_(WORKSPACE|WORKSPACE_NAME|PROJECT|BRANCH|BASE|PATH|PR|STORAGE_FOLDER|WIDGET_WS)|PORT)\b|\bworkspace\b/
async function checkOne(x: Source, run: boolean, ws?: string, agent = false): Promise<UiProblem[]> {
  const out: UiProblem[] = []
  const say = (level: UiProblem['level'], where: string, text: string) => out.push({ level, where, text })
  const id = [...widgets.values()].find(w => pathOf(w) === pathOf(x))?.id ?? idOf(x) // a repo's is <project>.<id>
  const head = x.file ?? 'widget.json'
  let m: Record<string, unknown>
  if (x.file) {
    const one = oneFile(x.d, x.file)
    if (typeof one === 'string') return say('error', head, one), out
    const { seconds, ...rest } = one
    if (seconds) say('error', head, `every ${seconds} s: at most once a minute (${id}.1m.${x.file.split('.').pop()})`)
    m = rest
  } else {
    let j: unknown
    try {
      j = JSON.parse(readFileSync(join(x.d, 'widget.json'), 'utf8'))
    } catch (e) {
      return say('error', head, (e as Error).message), out
    }
    if (!j || typeof j !== 'object' || Array.isArray(j)) return say('error', head, 'an object: { "name": … }'), out
    m = j as Record<string, unknown>
  }
  const mp = manifestCheck(m).map(p => (x.file ? { ...p, where: p.where.replace(/^widget\.json/, x.file), text: p.text.replace('no sample:', 'no <laki.sample>:') } : p))
  out.push(...mp)
  if (!mp.some(p => p.level === 'error')) say('ok', head, 'reads')
  // R2: the programs its commands run, each in needs.bins (so Laki can say when one's missing), and those on this Mac
  const needs = needsOf(m)
  const cmds = [typeof m.fetch === 'string' && !x.file ? m.fetch : '', ...Object.values(isObj(m.actions) ? m.actions : {}).map(a => actionCmd(a) ?? '')]
  const used = [...new Set(cmds.flatMap(binsIn))]
  for (const b of used.filter(b => !needs.bins.includes(b))) say('warn', `${head} needs`, `${b}: its commands run it, not in needs.bins: add it ("needs": { "bins": [${[...needs.bins, b].map(n => JSON.stringify(n)).join(', ')}] }) and Laki says when a Mac doesn't have it`)
  for (const b of needs.bins.filter(b => !binOn(b))) say('warn', `${head} needs`, `${b} isn't on this Mac's PATH (what its commands get)`)
  if (needs.bins.length && needs.bins.every(binOn) && used.every(b => needs.bins.includes(b))) say('ok', `${head} needs`, `${needs.bins.join(', ')}: on this Mac`)
  if (typeof m.script === 'string') {
    const p = resolve(x.d, m.script)
    if (!p.startsWith(x.d + '/')) say('error', 'widget.json script', `${m.script} isn't in the extension's folder`)
    else if (!existsSync(p)) say('error', 'widget.json script', `no file ${m.script}`)
  }
  const html = x.file ? '' : htmlOf(x.d)
  const bad = templatesError(m as Manifest, html)
  if (bad) say('error', bad.startsWith('ui:') ? 'ui' : 'widget.html', bad.replace(/^(ui|widget\.html): /, ''))
  else if (html) say('ok', 'widget.html', 'its templates read')
  // ui: alone, then against each set of data (only what the data adds)
  const actions = m.actions && typeof m.actions === 'object' && !Array.isArray(m.actions) ? Object.keys(m.actions) : []
  const ui = m.ui
  const key = (p: UiProblem) => `${p.level}|${p.where}|${p.text}`
  const alone = ui === undefined ? [] : uiCheck(ui, undefined, { actions })
  const seen = new Set(alone.map(key))
  // with no ui, only the names Laki's own hide (widget.html's templates read them too)
  const against = (data: unknown, what: string) => {
    const ps = (ui === undefined ? reservedIn(data) : uiCheck(ui, data, { actions })).filter(p => !seen.has(key(p)))
    out.push(...ps.map(p => ({ ...p, where: `${what} · ${p.where}` })))
    if (!ps.length) say('ok', what, ui === undefined ? 'reads' : 'fits the ui')
  }
  if (ui !== undefined) {
    out.push(...alone)
    if (!alone.length) say('ok', 'ui', 'its elements check out')
  }
  if (m.sample !== undefined) against(m.sample, 'sample')
  for (const n of x.file ? [] : fixtureNames(x.d)) {
    let data: unknown
    try {
      data = JSON.parse(readFileSync(join(x.d, 'fixtures', n), 'utf8'))
    } catch (e) {
      say('error', `fixtures/${n}`, (e as Error).message)
      continue
    }
    against(data, `fixtures/${n}`)
  }
  // a one-file extension's id is its name's first part: renamed, its settings stay under the old one
  if (x.file && !existsSync(storePath(id))) {
    const lost = filesIn(join(dir, 'widget-data')).filter(n => n.endsWith('.json') && !n.endsWith('.chat.json') && !widgets.has(n.slice(0, -5))).map(n => n.slice(0, -5))
    if (lost.length) say('warn', head, `no settings kept for ${id}; ${lost.join(', ')} ${lost.length > 1 ? 'have' : 'has'} some, and no extension: renamed? The old name brings them back`)
  }
  if (Object.values(isObj(m.actions) ? m.actions : {}).some(a => toolOf(a))) {
    const agents = x.file ? undefined : join(x.d, 'AGENTS.md')
    if (!agents || !existsSync(agents)) say('warn', 'AGENTS.md', 'none: a few lines on when to use its tools (and when not) help agents pick them')
    else if (statSync(agents).size > 4096) say('warn', 'AGENTS.md', 'over 4 KB: agents get its first 4 KB')
  }
  if (m.scope === 'workspace') {
    const texts = [m.fetch, JSON.stringify(ui ?? ''), JSON.stringify(m.source ?? ''), html, ...(x.file ? [readFileSync(join(x.d, x.file), 'utf8')] : filesIn(x.d).filter(n => /\.(sh|bash|zsh|py|rb|m?js|ts)$/.test(n)).map(n => (statSync(join(x.d, n)).size < 64 << 10 ? readFileSync(join(x.d, n), 'utf8') : '')))]
    if (!texts.some(t => typeof t === 'string' && WS_USE.test(t))) say('warn', head, 'per workspace, but its fetch and ui use nothing of the workspace ($LAKI_BRANCH, $PORT, {{workspace.branch}}…): "scope": "global"?')
  }
  if (run && (m.fetch || m.script || sourceOk(m.source) || widgets.get(id)?.s.source)) {
    const w = widgets.get(id)
    if (!w || pathOf(w) !== pathOf(x)) say('warn', 'fetch', `not run: Laki doesn't have this one (laki widget dev ${pathOf(x)} links it)`)
    else if (!onOf(w) && w.s.by === 'ai') say('warn', 'fetch', "not run: Laki AI wrote it and it's off: turn it on first")
    else if (!onOf(w) && agent) say('warn', 'fetch', "not run: it's off, and an agent asked: the user turns it on first")
    else if (!onOf(w) && guarded(w)) say('warn', 'fetch', `not run: it ${whence(w)} and it's off: look at what it runs first (laki widget what ${w.id})`)
    else if (scoped(w) && !ws) say('warn', 'fetch', 'not run: per workspace, which one? (--ws <id>)')
    else if (streaming(w)) say('warn', 'fetch', 'not run: it streams (laki widget dev prints its lines as they come)')
    else if (sourceOf(w).kind === 'ai') say('warn', 'fetch', 'not run: an agent makes its data, and each run costs (Run now on its page runs it)')
    else {
      const r = await widgetRun({ id, reason: 'manual', why: 'check', ws }, true).catch(e => ({ ok: false, error: (e as Error).message }))
      const last = runs.get(keyOf(id, scoped(w) ? ws : undefined))?.[0]
      if (!r.ok) say('error', 'fetch', `${r.error}${last && !last.ok && last.exit ? ` (exit ${last.exit})` : ''}`)
      else {
        const kind = sourceOf(w).kind
        say('ok', 'fetch', kind === 'fetch' ? `printed ${last?.bytes ?? 0} B of JSON in ${last?.ms ?? 0} ms` : `read ${last?.bytes ?? 0} B from its ${kind === 'static' ? 'text' : kind === 'ai' ? 'agent' : kind} in ${last?.ms ?? 0} ms`)
        against(dataOf(w, scoped(w) ? ws : undefined).data, 'fetched')
      }
    }
  }
  return out
}
