// Proof facts in a PR's body (core.ts ship, the Ship sheet's "Add what Laki checked"): what the last Done check ran and
// saw, as Markdown under "## Checked by Laki": a line per script (its name, pass or fail, how long), the second
// opinion's verdict in a line (never its words), what the checked turn touched. Nothing else: no output, no paths, no
// pictures; each line through mask (the daemon's redact, as shared tabs mask). stale: the check saw another tree than
// the one shipped (a change since, a file left out): only that is said. No script ran and no review: nothing
import type { CheckRun, Proof } from './types.ts'

export const PROOF_HEAD = '## Checked by Laki'
const took = (ms: number) => (ms < 1000 ? `${ms} ms` : ms < 120000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60000)} min`)
export function proofMd(p: Proof | undefined, o: { stale?: boolean; mask?: (s: string) => string; review?: CheckRun['review'] } = {}): string {
  const r = o.review && ['pass', 'note', 'fail'].includes(o.review.state) ? o.review : undefined
  if (!p || (!p.checks.length && !r)) return ''
  if (o.stale) return `${PROOF_HEAD}\n\nChecked before the latest changes.`
  const m = o.mask ?? (s => s)
  const code = (s: string) => `\`${s.replace(/`/g, "'")}\``
  const lines = p.checks.map(c => `- ${c.ok ? '✅' : '❌'} ${code(c.name)} ${c.ok ? 'passed' : /^took over/.test(c.summary) ? 'timed out' : `failed (exit ${c.code})`}, ${took(c.ms)}`)
  if (r) {
    const n = r.note ? r.note.split('\n').filter(l => l.trim()).length : 0
    lines.push(`- Second opinion (${code(r.agent)}): ${r.state === 'pass' ? 'no notes' : r.state === 'note' ? `${n} note${n === 1 ? '' : 's'}` : "couldn't review"}`)
  }
  const f = p.facts
  const touched = [f.tests && 'tests', f.ci && 'CI', f.migrations && 'migrations', f.lockfiles && 'lockfiles'].filter(Boolean)
  if (touched.length) lines.push(`- touches: ${touched.join(', ')}`)
  return `${PROOF_HEAD}\n\n${lines.map(m).join('\n')}`
}
