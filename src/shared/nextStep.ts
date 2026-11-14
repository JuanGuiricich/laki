// One next step (git: its project's a repo; merge: the project lets the app merge):
// the single thing a workspace needs from you now, from its tabs, its Done check and its PR:
// the toolbar's button (⌘G) and a chip on its sidebar row. busy: nothing for you yet (an agent works, CI runs), the
// button says so and the row shows no chip. The palette's *For <workspace>* lists every one that applies; this picks one.
import { planNow } from './todos.ts'
import type { TabView, WorkspaceView } from './types.ts'

export type StepId = 'continue' | 'answer' | 'plan' | 'check' | 'conflict' | 'ci' | 'review' | 'merge' | 'archive' | 'look' | 'ship' | 'working' | 'wait'
export type Step = { id: StepId; label: string; tip?: string; tab?: string; busy?: boolean; tone?: 'ask' | 'bad' | 'go' }

export function nextStep(w: WorkspaceView, tabs: TabView[], o: { merge?: boolean; git?: boolean } = {}): Step | undefined {
  if (w.archived) return
  const mine = tabs.filter(t => t.workspace === w.id)
  const waits = mine.find(t => t.status === 'waiting')
  if (waits?.planAsk) return { id: 'plan', label: 'Approve the plan', tip: `${waits.name} asks you to approve its plan, or change it`, tab: waits.id, tone: 'ask' }
  if (waits) return { id: 'answer', label: `Answer ${waits.name}`, tip: waits.ask?.question || waits.ask?.options.map(x => x.label).join(' / ') || 'It waits for you', tab: waits.id, tone: 'ask' }
  const runs = mine.find(t => t.status === 'running' && (t.kind === 'agent' || t.runs))
  if (runs) return { id: 'working', label: (runs.plan && !runs.plan.stale && planNow(runs.plan)) || `${runs.name} works`, tip: 'Nothing for you yet: it tells you when it needs you', tab: runs.id, busy: true }
  const failed = mine.find(t => t.failed)
  if (failed) return { id: 'continue', label: 'Continue', tip: `${failed.name} stopped: ${failed.failed}`, tab: failed.id, tone: 'bad' }
  if (w.check?.status === 'checking') return { id: 'working', label: 'Checking its work', tip: 'Its Done check runs before you\'re told it\'s done', busy: true }
  if (w.check?.status === 'over') return { id: 'check', label: 'Fix the failing check', tip: `${w.check.steps.find(s => s.state === 'fail')?.name ?? 'Its check'} still fails after ${w.check.tries} tries`, tab: w.check.tab, tone: 'bad' }
  const pr = w.pr
  if (pr && pr.state !== 'OPEN') return { id: 'archive', label: 'Archive', tip: `#${pr.number} is ${pr.state.toLowerCase()}: its worktree can go`, tone: 'go' }
  if (pr?.conflict) return { id: 'conflict', label: 'Resolve conflicts', tip: `#${pr.number} conflicts with ${pr.base ?? 'its base'}: the agent merges it in`, tone: 'bad' }
  if (pr?.checks === 'fail') return { id: 'ci', label: 'Fix CI', tip: `#${pr.number}'s failing checks, sent to the agent`, tone: 'bad' }
  if (pr?.review === 'CHANGES_REQUESTED') return { id: 'review', label: 'Address the review', tip: `Changes asked for on #${pr.number}${pr.changes?.length ? ` by ${pr.changes.join(', ')}` : ''}: its comments, sent to the agent`, tone: 'bad' }
  if (pr?.checks === 'pending') return { id: 'wait', label: 'CI runs', tip: `#${pr.number}'s checks are running`, busy: true }
  if (pr?.checks === 'cancelled') return { id: 'wait', label: 'Checks cancelled', tip: `#${pr.number}: run them again on ${pr.forge === 'gitlab' ? 'GitLab' : 'GitHub'}, or push`, busy: true }
  if (pr && pr.draft) return { id: 'wait', label: 'Draft PR', tip: `#${pr.number} is a draft`, busy: true }
  if (pr && pr.ready !== false && pr.review !== 'REVIEW_REQUIRED' && o.merge) return { id: 'merge', label: `Merge #${pr.number}`, tip: `${pr.title ?? ''}${pr.title ? ': ' : ''}${pr.checks ? 'checks pass' : 'no checks'}, no conflicts`, tone: 'go' }
  if (pr) return { id: 'wait', label: 'In review', tip: `#${pr.number} waits for its reviews`, busy: true }
  const done = mine.find(t => t.kind === 'agent' && t.done && t.status === 'idle')
  const changed = w.stat ? w.stat.files > 0 || w.stat.dirty > 0 : !!done
  if (done && o.git !== false) return { id: 'look', label: 'Review changes', tip: `${done.name} is done: what it changed`, tab: done.id }
  if (w.kind === 'worktree' && changed) return { id: 'ship', label: 'Ship', tip: 'Commit, push, open a PR', tone: 'go' }
}

// U5: the Board's columns, from the same rules: what the sidebar's Needs you counts (needsTab) is always in Answer, Review
// or Fix, never in Working, Merge or Done. setup: its setup script runs
// the edge glow (settings.edgeGlow): an agent waits for you in a workspace that isn't the one on screen (shown), its
// tab and its workspace not muted, the workspace not archived. Reduced motion, a flat look, a small window and a phone:
// styles.css' and App's, not here
export const waitsElsewhere = (wss: WorkspaceView[], tabs: TabView[], shown?: string | null) =>
  tabs.some(t => t.status === 'waiting' && !t.muted && t.workspace !== shown && (w => !!w && !w.muted && !w.archived)(wss.find(w => w.id === t.workspace)))
export const needsTab = (t: TabView) => t.status === 'waiting' || !!t.secret || !!t.failed || (!!t.done && t.status === 'idle')
// the remote page's icon badge (navigator.setAppBadge: the page's, and Web Push's payload for its service worker): what
// Needs you counts, a muted tab, a muted or archived workspace and one not in the view aside, as the Dock's count
export function badgeOf(v: { workspaces: WorkspaceView[]; tabs: TabView[] }) {
  const live = new Set(v.workspaces.filter(w => !w.muted && !w.archived).map(w => w.id))
  return v.tabs.filter(t => needsTab(t) && !t.muted && live.has(t.workspace)).length
}
export const BOARD = [['working', 'Working'], ['answer', 'Answer'], ['review', 'Review'], ['fix', 'Fix'], ['merge', 'Merge'], ['done', 'Done']] as const
export type BoardCol = (typeof BOARD)[number][0]
export function boardCol(w: WorkspaceView, tabs: TabView[], o: { merge?: boolean; git?: boolean } = {}): BoardCol {
  const mine = tabs.filter(t => t.workspace === w.id)
  if (mine.some(t => t.status === 'waiting' || t.secret || t.failed)) return 'answer'
  const needs = mine.some(needsTab) // a finish you haven't looked at
  const st = nextStep(w, tabs, o)
  if (!needs && (w.setup || st?.id === 'working')) return 'working'
  if (st && ['check', 'conflict', 'ci', 'review'].includes(st.id)) return 'fix'
  if (needs || st?.id === 'look' || st?.id === 'ship') return 'review'
  return st?.id === 'merge' || st?.id === 'wait' ? 'merge' : 'done'
}

// How long a turn usually takes (a running agent tab's "4 min · usually 6"): the median of a project's and profile's
// last turns' working time in seconds (core.ts turnTook keeps USUAL_KEEP that ran USUAL_MIN or more), none under USUAL_N
export const USUAL_MIN = 20
export const USUAL_N = 5
export const USUAL_KEEP = 20
export function usual(samples: number[]): number | undefined {
  const s = samples.filter(x => x >= USUAL_MIN).sort((a, b) => a - b)
  if (s.length < USUAL_N) return
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
const mins = (sec: number) => Math.max(1, Math.round(sec / 60))
export const usualText = (ran: number, usualSec: number) => `${mins(ran)} min · usually ${mins(usualSec)}`
// past twice its usual and 5 minutes: its time drawn in the waiting color (no notice: settings.longTurn is the alert)
export const overUsual = (ran: number, usualSec: number) => ran >= 2 * usualSec && ran >= 300
