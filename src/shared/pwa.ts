// the remote page as an app (M4, docs/dev/remote.md): its manifest (main.ts serves it at a stable address), with three
// shortcuts on its icon's long press (Android; iOS has none), and the page's router for them: the fragment they open
// with, as a laki:// link App routes as it does every link (a select or a fill-in, never a start)
import { needsTab } from './nextStep.ts'
import type { TabView, WorkspaceView } from './types.ts'

const ICON = [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }]
export const SHORTCUTS = ['new', 'needs', 'last'] as const
export type Shortcut = (typeof SHORTCUTS)[number]
export function manifestOf() {
  return {
    name: 'Laki',
    short_name: 'Laki',
    description: 'Your coding agents, from your phone',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#171412',
    theme_color: '#171412',
    icons: [...ICON, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    shortcuts: [
      { name: 'New workspace', short_name: 'New', url: '/#new', icons: ICON },
      { name: 'Needs you', short_name: 'Needs you', url: '/#needs', icons: ICON },
      { name: 'Last workspace', short_name: 'Last', url: '/#last', icons: ICON },
    ],
  }
}
// the fragment's shortcut (#new, #needs, #last; the link's own t= and k= go first: api.ts pageToken), as a link:
// new, the new-workspace page; needs, the first tab waiting on you, else the first that needs you (muted and archived
// aside), none: the board; last, the workspace you had open (last: App's laki.ws), if it's still there. undefined: no
// shortcut in it
export function shortcutOf(hash: string, v: { workspaces: WorkspaceView[]; tabs: TabView[] }, last?: string | null): string | undefined {
  const h = new URLSearchParams(hash.replace(/^#/, ''))
  const s = SHORTCUTS.find(k => h.has(k))
  if (!s) return
  if (s === 'new') return 'laki://new'
  const live = v.workspaces.filter(w => !w.archived)
  if (s === 'last') return (w => (w ? `laki://ws/${encodeURIComponent(w.id)}` : 'laki://board'))(live.find(w => w.id === last))
  const ok = new Set(live.filter(w => !w.muted).map(w => w.id))
  const needs = v.tabs.filter(t => needsTab(t) && !t.muted && ok.has(t.workspace))
  const t = needs.find(x => x.status === 'waiting') ?? needs[0]
  return t ? `laki://ws/${encodeURIComponent(t.workspace)}?tab=${encodeURIComponent(t.id)}` : 'laki://board'
}
