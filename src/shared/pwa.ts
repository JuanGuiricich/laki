// the remote page as an app (M4, docs/dev/remote.md): its manifest (main.ts serves it at a stable address), with three
// shortcuts on its icon's long press (Android; iOS has none), and the page's router for them: the plain fragment they
// open with, read once the page is unlocked, then taken off the address
const ICON = [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }]
export const SHORTCUTS = ['new', 'needs', 'last'] as const
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
      { name: 'New task', short_name: 'New task', url: '/#new', icons: ICON },
      { name: 'Needs you', short_name: 'Needs you', url: '/#needs', icons: ICON },
      { name: 'Last workspace', short_name: 'Last', url: '/#last', icons: ICON },
    ],
  }
}
// a shortcut's fragment (only a plain #new, #needs or #last) as what the page does: new, the new-task page (an Answer
// only device can't start agents: Needs you instead); needs, the Needs you list; last, the workspace you had open (App's
// laki.ws) if it's still there, else nothing. Locked (a PIN or passkey pending, no view yet): wait, the fragment kept.
// undefined: not a shortcut, the fragment left alone
export type ShortcutGo = { to: 'new' } | { to: 'needs' } | { to: 'ws'; ws: string } | { to: 'none' } | { to: 'wait' }
export function shortcutOf(hash: string, o: { locked: boolean; level?: 'answer' | 'full'; workspaces?: { id: string; archived?: boolean }[]; last?: string | null }): ShortcutGo | undefined {
  const s = /^#(new|needs|last)$/.exec(hash)?.[1]
  if (!s) return
  if (o.locked) return { to: 'wait' }
  if (s === 'new') return o.level === 'answer' ? { to: 'needs' } : { to: 'new' }
  if (s === 'needs') return { to: 'needs' }
  const w = o.workspaces?.find(x => x.id === o.last && !x.archived)
  return w ? { to: 'ws', ws: w.id } : { to: 'none' }
}
