import type { ChatResult, GoldenEntry } from '../types.js'
import type { Category, PassMarks } from './passmarks.js'
import { describeFaithfulness, retrievalRank, scoreFaithfulness, scoreRefusal } from './score.js'

export type Mode = 'fast' | 'full'
export type RetrievedLite = { source: string; heading: string; text: string; score: number }

// What was observed for one question. `result` exists only when the model was used.
export type Probe = { retrieved: RetrievedLite[]; result?: ChatResult; ms?: number; error?: string }

export type EvalInput = {
  mode: Mode
  model: string
  threshold: number
  topK: number
  entries: GoldenEntry[]
  // Must not throw: failures of the model are reported in `error`.
  probe: (question: string) => Promise<Probe>
  passMarks: PassMarks
  // Set when the full tier could not use the model (for example Ollama is not running).
  skipReason?: string
  onProgress?: (line: string) => void
}

export type CategoryResult = {
  key: Category
  label: string
  status: 'scored' | 'partial' | 'skipped'
  passed: number
  total: number
  heldPassed: number
  heldTotal: number
  note: string
  failures: string[]
  passMark: number | null
}

export type Report = {
  mode: Mode
  model: string
  threshold: number
  topK: number
  questions: number
  heldOut: number
  generation: boolean
  skipReason?: string
  categories: CategoryResult[]
  avgMs?: number
  maxMs?: number
}

type Item = { pass: boolean; heldOut: boolean }
const tally = (items: Item[]) => ({
  passed: items.filter((i) => i.pass).length,
  total: items.length,
  heldPassed: items.filter((i) => i.pass && i.heldOut).length,
  heldTotal: items.filter((i) => i.heldOut).length,
})

const label = (entry: GoldenEntry) => `${entry.id} (${entry.type}${entry.heldOut ? ', held-out' : ''})`

export async function evaluate(input: EvalInput): Promise<Report> {
  const generation = input.mode === 'full' && input.skipReason === undefined
  const probes: { entry: GoldenEntry; probe: Probe }[] = []
  for (const entry of input.entries) {
    const probe = await input.probe(entry.question)
    probes.push({ entry, probe })
    input.onProgress?.(`${entry.id} ${probe.error ? 'error' : probe.result ? probe.result.kind : 'retrieved'}${probe.ms !== undefined ? ` ${(probe.ms / 1000).toFixed(1)}s` : ''}`)
  }
  const refusedByThreshold = (probe: Probe) => probe.retrieved.length === 0 || probe.retrieved[0].score < input.threshold
  const answerable = probes.filter((p): p is { entry: Extract<GoldenEntry, { expect: 'answer' }>; probe: Probe } => p.entry.expect === 'answer')

  // 1. Retrieval: the expected section (article and heading) is among the chunks that were retrieved.
  const retrievalItems = answerable.map(({ entry, probe }) => {
    const rank = retrievalRank(entry, probe.retrieved)
    return { entry, rank, pass: rank !== undefined, probe }
  })
  const retrieval: CategoryResult = {
    key: 'retrieval',
    label: 'Retrieval',
    status: 'scored',
    ...tally(retrievalItems.map((i) => ({ pass: i.pass, heldOut: i.entry.heldOut }))),
    note: `the expected section (article and heading) is among the top ${input.topK} chunks, for the ${answerable.length} answerable questions; it is the very first chunk in ${retrievalItems.filter((i) => i.rank === 1).length} of them`,
    failures: retrievalItems
      .filter((i) => !i.pass)
      .map((i) => `${label(i.entry)}: expected ${i.entry.sourceDoc} / ${i.entry.sourceHeadings.join(' or ')}, retrieved ${i.probe.retrieved.map((c) => `${c.source} / ${c.heading}`).join('; ') || 'nothing'}`),
    passMark: input.passMarks.retrieval,
  }

  // 2. Faithfulness: only for answers that were actually given.
  let faithfulness: CategoryResult
  if (generation) {
    const answered = answerable.flatMap(({ entry, probe }) => {
      if (probe.result?.kind !== 'answer') return []
      const detail = scoreFaithfulness(entry, probe.result, probe.retrieved.map((c) => c.text))
      return [{ entry, detail, source: probe.result.source }]
    })
    const refused = answerable.filter((p) => p.probe.result?.kind === 'refusal').length
    const errors = answerable.filter((p) => p.probe.error !== undefined).length
    faithfulness = {
      key: 'faithfulness',
      label: 'Faithfulness',
      status: 'scored',
      ...tally(answered.map((a) => ({ pass: a.detail.pass, heldOut: a.entry.heldOut }))),
      note: `right article cited, key phrases present, no number or option missing from the retrieved text; scored on ${answered.length} of ${answerable.length} answerable questions (${refused} refused and ${errors} failed to run are counted under Correct refusal)`,
      failures: answered.filter((a) => !a.detail.pass).map((a) => `${label(a.entry)}: ${describeFaithfulness(a.detail, a.entry.sourceDoc, a.source)}`),
      passMark: input.passMarks.faithfulness,
    }
  } else {
    faithfulness = {
      key: 'faithfulness',
      label: 'Faithfulness',
      status: 'skipped',
      passed: 0,
      total: 0,
      heldPassed: 0,
      heldTotal: 0,
      note: input.mode === 'fast' ? 'not run in the fast tier (needs the model)' : `not run: ${input.skipReason}`,
      failures: [],
      passMark: input.passMarks.faithfulness,
    }
  }

  // 3. Correct refusal: traps refused and answerable questions not refused.
  let refusal: CategoryResult
  if (generation) {
    const items = probes.map(({ entry, probe }) => ({
      entry,
      probe,
      pass: probe.result !== undefined && scoreRefusal(entry, probe.result),
    }))
    const trapItems = items.filter((i) => i.entry.expect === 'refusal')
    const answerItems = items.filter((i) => i.entry.expect === 'answer')
    refusal = {
      key: 'refusal',
      label: 'Correct refusal',
      status: 'scored',
      ...tally(items.map((i) => ({ pass: i.pass, heldOut: i.entry.heldOut }))),
      note: `${trapItems.filter((i) => i.pass).length} of ${trapItems.length} questions that must be refused were refused; ${answerItems.filter((i) => i.pass).length} of ${answerItems.length} answerable questions were answered`,
      failures: items
        .filter((i) => !i.pass)
        .map((i) => `${label(i.entry)}: ${i.probe.error ? `did not run (${i.probe.error})` : i.entry.expect === 'refusal' ? 'should have been refused but was answered' : 'should have been answered but was refused'}`),
      passMark: input.passMarks.refusal,
    }
  } else {
    const mustRefuse = probes.filter((p) => p.entry.expect === 'refusal')
    const passing = mustRefuse.map((p) => ({ pass: refusedByThreshold(p.probe), heldOut: p.entry.heldOut }))
    const wrongly = answerable.filter((p) => refusedByThreshold(p.probe))
    refusal = {
      key: 'refusal',
      label: 'Correct refusal',
      status: 'partial',
      ...tally(passing),
      note: `threshold only, not the full metric: ${passing.filter((p) => p.pass).length} of ${mustRefuse.length} questions that must be refused are already refused by the threshold, ${passing.filter((p) => !p.pass).length} need the model to decide; ${wrongly.length} answerable question(s) would be wrongly refused by the threshold${input.mode === 'full' ? ` (the model was not used: ${input.skipReason})` : ''}`,
      failures: wrongly.map((p) => `${label(p.entry)}: refused by the threshold alone (top score ${p.probe.retrieved[0]?.score.toFixed(2) ?? 'none'} is under ${input.threshold})`),
      passMark: input.passMarks.refusal,
    }
  }

  const times = probes.flatMap((p) => (p.probe.ms !== undefined ? [p.probe.ms] : []))
  return {
    mode: input.mode,
    model: input.model,
    threshold: input.threshold,
    topK: input.topK,
    questions: input.entries.length,
    heldOut: input.entries.filter((e) => e.heldOut).length,
    generation,
    skipReason: input.skipReason,
    categories: [retrieval, faithfulness, refusal],
    avgMs: generation && times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : undefined,
    maxMs: generation && times.length > 0 ? Math.max(...times) : undefined,
  }
}

// Why the run is not OK. Empty means OK. A category that could not run never counts as passing.
export function problems(report: Report): string[] {
  const found: string[] = []
  for (const c of report.categories) {
    if (report.mode === 'full' && c.status !== 'scored') found.push(`${c.label} could not be fully scored (${c.status === 'skipped' ? 'skipped' : 'threshold-only'})`)
    if (c.status === 'scored' && c.passMark !== null) {
      if (c.total === 0) found.push(`${c.label} scored no questions, so it cannot meet its pass mark`)
      else if (c.passed / c.total < c.passMark) found.push(`${c.label} is ${pct(c.passed, c.total)}, under its pass mark of ${Math.round(c.passMark * 100)}%`)
    }
  }
  return found
}

export const exitCode = (report: Report): 0 | 1 => (problems(report).length > 0 ? 1 : 0)

const pct = (passed: number, total: number) => (total === 0 ? 'n/a' : `${Math.round((passed / total) * 100)}%`)
const cell = (passed: number, total: number) => (total === 0 ? '-' : `${passed}/${total} ${pct(passed, total)}`)
const pad = (text: string, width: number) => text.padEnd(width)

export function renderScorecard(report: Report): string {
  const lines: string[] = []
  lines.push(`POS Support eval scorecard: ${report.mode === 'full' ? 'full tier (uses Ollama)' : 'fast tier (no LLM)'}`)
  lines.push(`model ${report.model} | refusal threshold ${report.threshold} | top-k ${report.topK} | ${report.questions} questions (${report.heldOut} held out)`)
  lines.push('')
  lines.push(`${pad('Category', 17)}${pad('Result', 25)}${pad('All questions', 17)}${pad('Held-out only', 17)}Pass mark`)
  for (const c of report.categories) {
    const result = c.status === 'scored' ? 'scored' : c.status === 'partial' ? 'PARTIAL (threshold only)' : 'SKIPPED'
    const all = c.status === 'skipped' ? '-' : cell(c.passed, c.total)
    const held = c.status === 'skipped' ? '-' : cell(c.heldPassed, c.heldTotal)
    const mark = c.passMark === null ? 'not set' : `${Math.round(c.passMark * 100)}%`
    lines.push(`${pad(c.label, 17)}${pad(result, 25)}${pad(all, 17)}${pad(held, 17)}${mark}`)
  }
  lines.push('')
  for (const c of report.categories) lines.push(`${c.label}: ${c.note}`)
  const failures = report.categories.flatMap((c) => c.failures.map((f) => `  [${c.label}] ${f}`))
  lines.push('')
  lines.push(failures.length === 0 ? 'No failing questions.' : `Failing questions (${failures.length}):`)
  lines.push(...failures)
  if (report.avgMs !== undefined && report.maxMs !== undefined) {
    lines.push('')
    lines.push(`Time per question: average ${(report.avgMs / 1000).toFixed(1)} s, slowest ${(report.maxMs / 1000).toFixed(1)} s`)
  }
  lines.push('')
  if (report.categories.every((c) => c.passMark === null)) lines.push('Pass marks are not set yet (task 11), so no category can fail on its percentage.')
  const found = problems(report)
  lines.push(found.length === 0 ? 'Result: OK' : 'Result: NOT OK')
  for (const problem of found) lines.push(`  - ${problem}`)
  return lines.join('\n')
}
