// What agents did through Laki's API, per workspace (main.ts' call: an agent's tab's calls that change something, and
// every one refused): when, which tab, the method, a summary of names and ids only (no prompt's text, no file's
// contents, no env: main.ts agentWhat) and ok or refused with why. The newest AGENT_LOG_MAX in memory and in
// <data>/agent-log/<ws>.jsonl (0600, a JSON line each, cut back to them once it holds 100 more); gone with the workspace
// (core's dropWs). Read by agentLog (the user's: the Info tab's "What its agents did", laki agent log). It never fails a call
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { writeAtomic } from '../shared/conn.ts'
import type { AgentDid } from '../shared/types.ts'
import { dir } from './dir.ts'

export const AGENT_LOG_MAX = 500
const kept = new Map<string, AgentDid[]>()
const lines = new Map<string, number>() // what its file holds
const fileOf = (ws: string) => (/^[\w.-]+$/.test(ws) ? join(dir, 'agent-log', `${ws}.jsonl`) : undefined)
function load(ws: string): AgentDid[] {
  let l = kept.get(ws)
  if (l) return l
  const f = fileOf(ws)
  const all = f && existsSync(f) ? readFileSync(f, 'utf8').split('\n').flatMap(x => { try { return x ? [JSON.parse(x) as AgentDid] : [] } catch { return [] } }) : []
  lines.set(ws, all.length)
  kept.set(ws, (l = all.slice(-AGENT_LOG_MAX)))
  return l
}
export function agentDid(e: AgentDid) {
  try {
    const f = fileOf(e.ws)
    if (!f) return
    const l = load(e.ws)
    l.push(e)
    if (l.length > AGENT_LOG_MAX) l.splice(0, l.length - AGENT_LOG_MAX)
    mkdirSync(join(dir, 'agent-log'), { recursive: true, mode: 0o700 })
    const n = (lines.get(e.ws) ?? 0) + 1
    if (n > AGENT_LOG_MAX + 100) writeAtomic(f, l.map(x => `${JSON.stringify(x)}\n`).join(''), 0o600), lines.set(e.ws, l.length)
    else appendFileSync(f, `${JSON.stringify(e)}\n`, { mode: 0o600 }), lines.set(e.ws, n)
  } catch {}
}
// newest first
export const agentLogOf = (ws: string) => [...load(ws)].reverse()
export function agentLogDrop(ws: string) {
  kept.delete(ws)
  lines.delete(ws)
  const f = fileOf(ws)
  if (f) rmSync(f, { force: true })
}
