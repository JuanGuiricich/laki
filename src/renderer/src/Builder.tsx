// C2, C3: binding data to an extension's ui, and building it without typing JSON.
// DataTree: its data as a tree; a click on a key or value puts its path where you're typing a ui field (`bindable`:
// Files' widget.json, the builder's props: the click keeps that field's focus), else copies it. A value: {{items.0.title}};
// a list or object: its bare path (each, values); a value inside a list also offers its each form ({{title}}, under
// "each": "items"). Builder (the Extension page's Build tab, your own extensions): the UI kit's elements to add (left),
// the preview on a sample with the outline under it (drag to reorder, onto a layout element to nest), the picked
// element's props and the data to bind (right). Every change writes widget.json's ui through widgetFileSave (a history
// snapshot first: the page's Undo); JSON stays the truth, no model of its own. Hover links both ways: an element lights
// the data paths it reads (readsOf), a path the elements that read it.
import { type DragEvent, type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import type { WidgetView } from '../../shared/types'
import { uiBehave, WIDGET_CSS } from '../../shared/widget'
import { COMMON, type Prop, readsOf, UI, UI_GROUPS, UI_SAMPLES, uiCheck, uiHtml, type UiGroup, type UiProblem } from '../../shared/widgetUi'
import type { WidgetsApi } from './Settings'
import { Icon } from './ui'
import { clean } from './Widgets'
import { diagramsIn } from './MarkdownView'

// the field a click in the tree types into: the one focused last (bindable's onFocus) while it still has the focus
let target: HTMLInputElement | HTMLTextAreaElement | null = null
export const bindable = { onFocus: (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => void (target = e.currentTarget) }
const put = (text: string, copy: (t: string) => void) => (target?.isConnected && document.activeElement === target ? void document.execCommand('insertText', false, text) : copy(text))

// a data path (items.0.title) against what an element reads (items.*.title)
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const matches = (path: string, reads: string[]) => reads.some(r => r === path || (r.includes('*') && new RegExp(`^${r.split('.').map(x => (x === '*' ? '\\d+' : esc(x))).join('\\.')}$`).test(path)))
const KEY = /^[\w@-]+$/ // a key a path can name
const MAX_KIDS = 200

export function DataTree({ data, reads = [], onHover, copy }: { data: unknown; reads?: string[]; onHover?: (path: string | null) => void; copy: (t: string) => void }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(['']))
  const [said, setSaid] = useState('')
  const give = (t: string) => put(t, x => (copy(x), setSaid(x), setTimeout(() => setSaid(''), 1500)))
  const toggle = (p: string) => setOpen(o => (n => (n.has(p) ? n.delete(p) : n.add(p), n))(new Set(o)))
  // arr: the nearest list above it and the path from its item (its each form)
  const node = (k: string, v: unknown, path: string, depth: number, arr?: { list: string; rel: string }): ReactElement[] => {
    const box = !!v && typeof v === 'object'
    const ok = path === '' || path.split('.').every(s => KEY.test(s))
    const lit = path !== '' && matches(path, reads)
    const row = (
      <div key={path || '.'} className={`dt-row ${lit ? 'lit' : ''}`} style={{ paddingLeft: depth * 12 }} onMouseDown={e => e.preventDefault()} onMouseEnter={() => onHover?.(path || null)} onMouseLeave={() => onHover?.(null)}>
        {box ? (
          <button type="button" className="dt-chev" aria-label={open.has(path) ? 'Fold' : 'Unfold'} onClick={() => toggle(path)}>
            <Icon name={open.has(path) ? 'chevron' : 'chevronRight'} size={10} />
          </button>
        ) : (
          <span className="dt-chev" />
        )}
        <button type="button" className="dt-key mono" disabled={!ok || path === ''} data-tip={ok ? (box ? `${path}: a path (each, values)` : `{{${path}}}`) : 'Not reachable by a path: rename it'} onClick={() => give(box ? path : `{{${path}}}`)}>
          {k}
        </button>
        {!box && (
          <button type="button" className="dt-val mono" disabled={!ok} onClick={() => give(`{{${path}}}`)}>
            {JSON.stringify(v)?.slice(0, 80)}
          </button>
        )}
        {box && <span className="muted small">{Array.isArray(v) ? `[${v.length}]` : `{${Object.keys(v as object).length}}`}</span>}
        {arr && !box && ok && (
          <button type="button" className="dt-each" data-tip={`Inside "each": "${arr.list}": {{${arr.rel || 'this'}}}`} onClick={() => give(`{{${arr.rel || 'this'}}}`)}>
            each
          </button>
        )}
      </div>
    )
    if (!box || !open.has(path)) return [row]
    const kids = Object.entries(v as object).slice(0, MAX_KIDS)
    return [
      row,
      ...kids.flatMap(([ck, cv]) => node(ck, cv, path ? `${path}.${ck}` : ck, depth + 1, Array.isArray(v) ? { list: path, rel: '' } : arr && { list: arr.list, rel: arr.rel ? `${arr.rel}.${ck}` : ck })),
    ]
  }
  // an object's fields are at the top ({{open}}); anything else is data ({{data.0.title}})
  const rows = data && typeof data === 'object' && !Array.isArray(data) ? Object.entries(data).slice(0, MAX_KIDS).flatMap(([k, v]) => node(k, v, k, 0)) : node('data', data, 'data', 0)
  return (
    <div className="dt" role="tree" aria-label="Its data: a click puts its path where you're typing, else copies it">
      {rows}
      {said && <p className="muted small">Copied {said}</p>}
    </div>
  )
}

type El = Record<string, unknown> & { type?: string }
type Path = (string | number)[]
const isEl = (v: unknown): v is El => !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as El).type === 'string'
const kidsKey = (el: unknown) => (isEl(el) ? Object.entries((UI as Record<string, { props: Record<string, Prop> }>)[el.type!]?.props ?? {}).find(([, p]) => p.kind === 'children')?.[0] : undefined)
const at = (root: unknown, path: Path): unknown => path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string | number, unknown>)[k] : undefined), root)
// the outline: each element, its depth, its path, uiCheck's where for it, the each scope it's under
type Row = { el: El; path: Path; depth: number; where: string; scope: string }
function outline(root: unknown, top: string): Row[] {
  const out: Row[] = []
  const go = (el: unknown, path: Path, depth: number, where: string, prefix: string) => {
    if (!isEl(el)) return
    const here = `${where} (${el.type})`
    const { scope } = readsOf(el, prefix)
    out.push({ el, path, depth, where: here, scope: prefix })
    const k = kidsKey(el)
    if (k && Array.isArray(el[k])) (el[k] as unknown[]).forEach((c, i) => go(c, [...path, k, i], depth + 1, `${here}.${k}[${i}]`, scope))
  }
  go(root, [], 0, top, '')
  return out
}
// a new element: its sample's spec (the element itself, not the stack it's shown in), to bind to this data
const own = (type: string, e: unknown): El | undefined => (isEl(e) && e.type === type ? e : isEl(e) && Array.isArray(e.children) ? e.children.map(c => own(type, c)).find(Boolean) : undefined)
const fresh = (type: string): El => structuredClone(own(type, UI_SAMPLES.find(x => x.type === type)?.spec) ?? { type })
const GROUPS = Object.keys(UI_GROUPS) as UiGroup[]

// the preview: the kit's HTML over the sample, each element marked by its path (its tip, in this copy only) so hover and a
// click find it. ponytail: an element whose HTML has no tip of its own (a few inline ones) isn't marked
function Preview({ root, data, full, cells, lit, onPick, onHover }: { root: unknown; data: unknown; full: boolean; cells: [number, number]; lit: string[]; onPick: (p: string) => void; onHover: (p: string | null) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const marked = useMemo(() => {
    const tag = (el: unknown, path: Path): unknown => {
      if (!isEl(el)) return el
      const k = kidsKey(el)
      return { ...el, tip: `@@${JSON.stringify(path)}`, ...(k && Array.isArray(el[k]) && { [k]: (el[k] as unknown[]).map((c, i) => tag(c, [...path, k, i])) }) }
    }
    return tag(root, [])
  }, [root])
  useEffect(() => {
    const r = host.current!.shadowRoot ?? host.current!.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = `${WIDGET_CSS}\n[data-bk].b-lit { outline: 2px solid var(--accent, #7aa2f7); outline-offset: 1px; } [data-bk]:hover { outline: 1px dashed var(--accent, #7aa2f7); }`
    r.replaceChildren(style, clean(uiHtml(marked, { data, config: {}, at: Date.now() - 120_000, sample: true }, full ? { full: true } : { cells })))
    for (const e of r.querySelectorAll<HTMLElement>('[title^="@@"]')) e.setAttribute('data-bk', e.title.slice(2)), e.removeAttribute('title')
    let live = true
    diagramsIn(r, () => live) // K4: as the cell draws them
    const off = uiBehave(r, () => Promise.resolve())
    return () => ((live = false), off())
  }, [JSON.stringify(marked), JSON.stringify(data), full, cells.join()])
  useEffect(() => {
    const r = host.current?.shadowRoot
    r?.querySelectorAll('[data-bk]').forEach(e => e.classList.toggle('b-lit', lit.includes(e.getAttribute('data-bk')!)))
  }, [lit.join('|'), JSON.stringify(marked), JSON.stringify(data)])
  const near = (e: Event) => (e.composedPath().find(x => x instanceof HTMLElement && x.hasAttribute('data-bk')) as HTMLElement | undefined)?.getAttribute('data-bk') ?? null
  return <div ref={host} className={`widget-body b-preview ${full ? 'full' : ''}`} style={full ? undefined : { width: cells[0] * 60, height: cells[1] * 64 }} onClickCapture={e => (p => p && (e.preventDefault(), e.stopPropagation(), onPick(p)))(near(e.nativeEvent))} onMouseOver={e => onHover(near(e.nativeEvent))} onMouseLeave={() => onHover(null)} />
}

// a prop's field: an enum a select, a bool a select, a list or object JSON, else a line (templates welcome)
function Field({ k, p, v, set }: { k: string; p: Prop; v: unknown; set: (v: unknown) => void }) {
  const [bad, setBad] = useState('')
  const id = `bp-${k}`
  const label = (
    <label htmlFor={id} className="b-label" data-tip={p.desc}>
      {k}
    </label>
  )
  if (Array.isArray(p.kind) || p.kind === 'bool') {
    const opts = Array.isArray(p.kind) ? (p.kind as readonly string[]) : ['true', 'false']
    return (
      <div className="b-field">
        {label}
        <select id={id} value={v === undefined ? '' : String(v)} onChange={e => set(e.target.value === '' ? undefined : p.kind === 'bool' ? e.target.value === 'true' : e.target.value)}>
          <option value="">unset</option>
          {opts.map(o => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
    )
  }
  const json = ['button', 'buttons', 'items', 'object'].includes(p.kind as string) || (v !== undefined && typeof v === 'object')
  const text = v === undefined ? '' : json ? JSON.stringify(v, null, 1) : String(v)
  const commit = (t: string) => {
    if (t === text) return
    if (!t.trim()) return set(undefined)
    if (!json) return set(p.kind === 'number' && Number.isFinite(Number(t)) && t.trim() !== '' ? Number(t) : t)
    try {
      set(JSON.parse(t))
      setBad('')
    } catch (e) {
      setBad((e as Error).message)
    }
  }
  return (
    <div className="b-field">
      {label}
      {json ? (
        <textarea id={id} key={text} className="mono" rows={3} defaultValue={text} spellCheck={false} placeholder={p.desc} {...bindable} onBlur={e => commit(e.currentTarget.value)} />
      ) : (
        <input id={id} key={text} className={p.kind === 'path' ? 'mono' : ''} defaultValue={text} spellCheck={false} placeholder={p.desc} {...bindable} onBlur={e => commit(e.currentTarget.value)} onKeyDown={e => e.key === 'Enter' && commit(e.currentTarget.value)} />
      )}
      {bad && <span className="warn small">{bad}</span>}
    </div>
  )
}

export function Builder({ w, cfg, copy }: { w: WidgetView; cfg: WidgetsApi; copy: (t: string) => void }) {
  const [files, setFiles] = useState<Record<string, string> | null>(null)
  const [text, setText] = useState('') // widget.json as this page last wrote or read it
  const [live, setLive] = useState<unknown>(undefined)
  const [sel, setSel] = useState<Path>([])
  const [view, setView] = useState<'preview' | 'full'>('preview')
  const [full, setFull] = useState(false)
  const [sample, setSample] = useState('') // '': widget.json's sample; fixtures/<n>.json; live
  const [hover, setHover] = useState<{ el?: string; path?: string } | null>(null)
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState<{ over: string; how: 'before' | 'after' | 'inside' } | null>(null)
  const chain = useRef(Promise.resolve())
  useEffect(() => {
    let on = true
    cfg.files?.(w.id).then(f => on && (setFiles(f), setText(f['widget.json'] ?? '')), e => on && setErr(String(e?.message ?? e)))
    cfg.runs?.(w.id, w.here ?? undefined).then(r => on && setLive(r.data ? JSON.parse(r.data) : undefined), () => {})
    return () => void (on = false)
  }, [w.id, w.rev])
  const m = useMemo(() => {
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      return null
    }
  }, [text])
  const split = !!m && !!m.ui && typeof m.ui === 'object' && !isEl(m.ui)
  const root = split ? (m!.ui as Record<string, unknown>)[view] : m?.ui
  const data = useMemo(() => {
    if (sample === 'live') return live
    if (sample && files?.[sample]) {
      try {
        return JSON.parse(files[sample])
      } catch {}
    }
    return m?.sample
  }, [sample, files, live, m?.sample])
  const rows = useMemo(() => outline(root, split ? `ui.${view}` : 'ui'), [root, split, view])
  const problems: UiProblem[] = useMemo(() => (m?.ui === undefined ? [] : uiCheck(m.ui, data, { actions: m.actions && typeof m.actions === 'object' ? Object.keys(m.actions) : [] })), [m, data])
  const cur = rows.find(r => JSON.stringify(r.path) === JSON.stringify(sel)) ?? rows[0]
  // hover: an element's reads lit in the tree; a path lights the elements reading it
  const reads = hover?.el ? (r => (r ? readsOf(r.el, r.scope).reads : []))(rows.find(r => JSON.stringify(r.path) === hover.el)) : cur ? readsOf(cur.el, cur.scope).reads : []
  const litEls = hover?.path ? rows.filter(r => matches(hover.path!, readsOf(r.el, r.scope).reads)).map(r => JSON.stringify(r.path)) : hover?.el ? [hover.el] : cur ? [JSON.stringify(cur.path)] : []
  // write the new tree: widget.json with it, one save after another (each one's was: the text before it)
  const write = (next: unknown, pick?: Path) => {
    if (!m) return
    const ui = split ? { ...(m.ui as object), [view]: next } : next
    const { ui: _, ...rest } = m
    const out = `${JSON.stringify(next === undefined && !split ? rest : { ...rest, ui }, null, 2)}\n`
    const was = text
    setText(out)
    if (pick) setSel(pick)
    chain.current = chain.current.then(() =>
      (cfg.save?.(w.id, 'widget.json', out, was) ?? Promise.reject(new Error('Not here'))).then(
        () => setErr(''),
        e => (setErr(String(e?.message ?? e)), cfg.files?.(w.id).then(f => (setFiles(f), setText(f['widget.json'] ?? '')))),
      ),
    )
  }
  const tree = () => structuredClone(root) as El | undefined
  const add = (type: string) => {
    const el = fresh(type)
    const t = tree()
    if (!t) return write(el, [])
    const p = cur?.path ?? []
    const there = at(t, p) as El
    const k = kidsKey(there)
    if (k) return ((there[k] = [...((there[k] as unknown[]) ?? []), el]), write(t, [...p, k, (there[k] as unknown[]).length - 1]))
    if (!p.length) return write({ type: 'stack', children: [t, el] }, ['children', 1])
    const list = at(t, p.slice(0, -1)) as unknown[]
    const i = p[p.length - 1] as number
    list.splice(i + 1, 0, el)
    write(t, [...p.slice(0, -1), i + 1])
  }
  const remove = (p: Path) => {
    if (!p.length) return write(undefined, [])
    const t = tree()!
    ;(at(t, p.slice(0, -1)) as unknown[]).splice(p[p.length - 1] as number, 1)
    write(t, p.slice(0, -2))
  }
  const setProp = (k: string, v: unknown) => {
    const t = tree()
    const el = cur && (at(t, cur.path) as El)
    if (!t || !el) return
    if (v === undefined) delete el[k]
    else el[k] = v
    write(t, cur.path)
  }
  // a drop: an element (by path) or a new one (by type) before, after or inside one
  const drop = (e: DragEvent, to: Path, how: 'before' | 'after' | 'inside') => {
    e.preventDefault()
    setDrag(null)
    const type = e.dataTransfer.getData('laki/ui-type')
    const from = e.dataTransfer.getData('laki/ui-path')
    const t = tree()
    if (!t) return type && write(fresh(type), [])
    const target = at(t, to) as El
    let moving: El
    if (type) moving = fresh(type)
    else {
      const fp = JSON.parse(from) as Path
      if (!fp.length || (to.length >= fp.length && fp.every((x, i) => to[i] === x))) return // the root, or into itself
      moving = at(t, fp) as El
      ;(at(t, fp.slice(0, -1)) as unknown[]).splice(fp[fp.length - 1] as number, 1)
    }
    const k = kidsKey(target)
    if (how === 'inside' && k) target[k] = [...((target[k] as unknown[]) ?? []), moving]
    else if (!to.length) return write({ type: 'stack', children: how === 'before' ? [moving, t] : [t, moving] })
    else {
      // the target's place, found again by identity (a move above it in the same list shifted it)
      const find = (v: unknown): [unknown[], number] | undefined => {
        if (!isEl(v)) return
        const kk = kidsKey(v)
        const l = kk && Array.isArray(v[kk]) ? (v[kk] as unknown[]) : []
        const i = l.indexOf(target)
        return i >= 0 ? [l, i] : l.map(find).find(Boolean)
      }
      const f = find(t)
      if (!f) return
      f[0].splice(f[1] + (how === 'after' ? 1 : 0), 0, moving)
    }
    write(t)
  }
  const over = (e: DragEvent, r: Row) => {
    e.preventDefault()
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (e.clientY - b.top) / b.height
    setDrag({ over: JSON.stringify(r.path), how: y < 0.35 ? 'before' : kidsKey(r.el) && y > 0.5 ? 'inside' : 'after' })
  }
  if (!files) return <section className="ext-card muted small">{err || 'Reading…'}</section>
  if (!m) return <section className="ext-card warn small">widget.json doesn’t read as JSON: fix it in Files first.</section>
  const props: [string, Prop][] = cur ? Object.entries({ ...((UI as Record<string, { props: Record<string, Prop> }>)[cur.el.type!]?.props ?? {}), ...COMMON } as Record<string, Prop>).filter(([, p]) => p.kind !== 'children') : []
  const samples = ['', ...Object.keys(files).filter(f => /^fixtures\/.+\.json$/.test(f)), ...(live !== undefined ? ['live'] : [])]
  return (
    <div className="b">
      <section className="ext-card b-kit" aria-label="The UI kit's elements">
        <b className="small">Add</b>
        <p className="muted small">Click to add after the picked one (or into it), or drag onto the outline</p>
        {GROUPS.map(g => (
          <details key={g} className="b-group">
            <summary>{g}</summary>
            {Object.entries(UI)
              .filter(([, d]) => (d as { group: UiGroup }).group === g)
              .map(([t, d]) => (
                <button key={t} type="button" className="b-add" draggable data-tip={(d as { blurb: string }).blurb} onDragStart={e => e.dataTransfer.setData('laki/ui-type', t)} onClick={() => add(t)}>
                  {t}
                </button>
              ))}
          </details>
        ))}
      </section>
      <section className="ext-card b-mid">
        <div className="ext-card-head">
          <b>Preview</b>
          {split && (
            <select aria-label="Which view" value={view} onChange={e => (setView(e.target.value as 'preview' | 'full'), setSel([]))}>
              <option value="preview">its preview</option>
              <option value="full">its full view</option>
            </select>
          )}
          <select aria-label="Its data" value={sample} onChange={e => setSample(e.target.value)}>
            {samples.map(s => (
              <option key={s} value={s}>
                {s === '' ? 'widget.json’s sample' : s === 'live' ? 'its live data' : s}
              </option>
            ))}
          </select>
          <label className="small">
            <input type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} /> full size
          </label>
        </div>
        {root === undefined ? <p className="muted small">No ui yet: add an element from the left.</p> : <Preview root={root} data={data} full={full} cells={w.size} lit={litEls} onPick={p => setSel(JSON.parse(p))} onHover={p => setHover(p ? { el: p } : null)} />}
        <ul className="b-outline" role="tree" aria-label="Its elements: drag to reorder, onto a layout element to nest">
          {rows.map(r => {
            const key = JSON.stringify(r.path)
            const bad = problems.filter(p => p.level !== 'ok' && p.where.startsWith(r.where) && !rows.some(x => x !== r && x.where.length > r.where.length && p.where.startsWith(x.where)))
            return (
              <li
                key={key}
                role="treeitem"
                aria-selected={cur === r}
                tabIndex={0}
                className={`b-row ${cur === r ? 'on' : ''} ${litEls.includes(key) ? 'lit' : ''} ${drag?.over === key ? `drop-${drag.how}` : ''}`}
                style={{ paddingLeft: 6 + r.depth * 14 }}
                draggable={r.path.length > 0}
                onDragStart={e => e.dataTransfer.setData('laki/ui-path', key)}
                onDragOver={e => over(e, r)}
                onDragLeave={() => setDrag(null)}
                onDrop={e => drop(e, r.path, drag?.how ?? 'after')}
                onClick={() => setSel(r.path)}
                onMouseEnter={() => setHover({ el: key })}
                onMouseLeave={() => setHover(null)}
                onKeyDown={e => (e.key === 'Delete' || e.key === 'Backspace') && remove(r.path)}
              >
                <b className="mono">{r.el.type}</b>
                {r.el.each !== undefined && <span className="muted small"> each {String(r.el.each)}</span>}
                {bad.length > 0 && (
                  <span className={bad.some(p => p.level === 'error') ? 'bad small' : 'warn small'} data-tip={bad.map(p => p.text).join('\n')}>
                    {' '}
                    {bad.some(p => p.level === 'error') ? '✗' : '!'} {bad.length}
                  </span>
                )}
                <span className="grow" />
                <button type="button" className="ib sm" aria-label={`Delete ${r.el.type}`} onClick={e => (e.stopPropagation(), remove(r.path))}>
                  <Icon name="x" size={11} />
                </button>
              </li>
            )
          })}
        </ul>
        {problems.filter(p => p.level !== 'ok').length > 0 && (
          <ul className="b-problems small">
            {problems
              .filter(p => p.level !== 'ok')
              .map((p, i) => (
                <li key={i} className={p.level === 'error' ? 'bad' : 'warn'}>
                  {p.level === 'error' ? '✗' : '!'} {p.where}: {p.text}
                </li>
              ))}
          </ul>
        )}
        {err && <p className="warn small">{err}</p>}
      </section>
      <section className="ext-card b-side">
        <b className="small">{cur ? `${cur.el.type}’s props` : 'Props'}</b>
        {cur ? props.map(([k, p]) => <Field key={`${JSON.stringify(cur.path)}:${k}`} k={k} p={p} v={cur.el[k]} set={v => setProp(k, v)} />) : <p className="muted small">Pick an element</p>}
        <b className="small">Its data</b>
        <p className="muted small">Click a path: into the field you're in, else copied</p>
        <DataTree data={data} reads={reads} copy={copy} onHover={p => setHover(p ? { path: p } : null)} />
      </section>
    </div>
  )
}
