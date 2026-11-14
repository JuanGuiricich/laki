// Proof facts in a PR's body (core.ts ship, the Ship sheet's "Add what Laki checked"): what the last Done check ran and
// saw, as Markdown under "## Checked by Laki". Only Laki's own facts (each script's end and time, git's facts), never the
// agent's words; mask: each line through it (the daemon's redact). stale: the check saw another tree than the one
// shipped (a turn after it, a file left out), and only that is said. No script ran: nothing
import type { Proof } from './types.ts'

export function proofMd(p: Proof | undefined, o: { stale?: boolean; mask?: (s: string) => string } = {}): string {
  if (!p?.checks.length) return ''
  const m = o.mask ?? (s => s)
  const head = '## Checked by Laki'
  if (o.stale) return `${head}\n\n_Laki's last check was of an earlier state of this branch: it changed since, so nothing is said here._`
  const tick = (s: string) => `\`${s.replace(/`/g, "'")}\``
  const lines = p.checks.map(c => m(`- ${c.ok ? '✅' : '❌'} ${tick(c.name)} ${c.summary}`))
  const f = p.facts
  const touched = [f.tests && 'tests', f.ci && 'CI', f.migrations && 'migrations', f.lockfiles && 'lockfiles'].filter(Boolean)
  if (f.files) lines.push(`- ${f.files} file${f.files === 1 ? '' : 's'} changed in the checked turn${touched.length ? `, touching ${touched.join(', ')}` : ''}`)
  return `${head}\n\n${lines.join('\n')}\n\n<sub>Run by Laki on this machine as the agent's turn ended (${new Date(p.turn).toISOString().slice(0, 16).replace('T', ' ')} UTC).</sub>`
}
