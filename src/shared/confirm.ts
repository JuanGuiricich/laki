// Settings › General's "Confirm risky actions with Touch ID" (settings.touchId, macOS): the actions it asks for, each with
// the words Touch ID's prompt says ("Laki is trying to …"). The renderer never decides: main prompts and, on success,
// mints a ticket (the daemon's ticketMint: 30 s, single use, bound to one of these) that the call carries; with the
// setting on, the daemon refuses these without one (main.ts' ticketNo), from the app's token too. The ticket rides as a call's touchTicket. touchIdOn: turning
// the setting on asks first too, though the daemon has nothing to hold then
import { neverAsks, type Preset } from './types.ts'

export const CONFIRM = {
  remoteStart: 'start remote access',
  remotePair: 'pair a device with remote access',
  bypass: 'turn on Bypass permissions',
  hookSecret: "show a webhook's secret",
  uiReset: 'reset the interface',
  touchIdOff: 'stop asking for Touch ID before risky actions',
  touchIdOn: 'ask for Touch ID before risky actions',
} as const
export type ConfirmWhat = keyof typeof CONFIRM
export const confirmKnown = (w: unknown): w is ConfirmWhat => typeof w === 'string' && Object.hasOwn(CONFIRM, w)
export const TICKET_MS = 30_000

// which of CONFIRM a call is, as the daemon has things now (cur: its settings' touchId and presets): a running tab
// switched to Bypass (tabMode), a profile saved as one that never asks that wasn't one (presetSave, or Settings'
// whole list), Touch ID turned off; undefined: none
type P = Record<string, unknown> | undefined
const bypassed = (x: Partial<Preset>, was?: Preset) => neverAsks(x.agent, x.perm, x.args) && !(was && neverAsks(was.agent, was.perm, was.args))
export function confirmOf(method: string, p: P, cur: { touchId?: boolean; presets?: Preset[] } = {}): ConfirmWhat | undefined {
  if (method === 'remoteStart' || method === 'remotePair' || method === 'hookSecret' || method === 'uiReset') return method
  if (method === 'tabMode') return p?.mode === 'bypassPermissions' ? 'bypass' : undefined
  if (method === 'presetSave' && p?.set && typeof p.set === 'object') {
    const was = cur.presets?.find(x => x.name === String(p.name ?? ''))
    return bypassed({ ...was, ...(p.set as Partial<Preset>) }, was) ? 'bypass' : undefined
  }
  if (method === 'settingsSet') {
    if (p?.touchId === false && cur.touchId) return 'touchIdOff'
    if (Array.isArray(p?.presets) && (p.presets as Partial<Preset>[]).some(x => x && typeof x === 'object' && bypassed(x, cur.presets?.find(y => y.name === x.name)))) return 'bypass'
  }
}
