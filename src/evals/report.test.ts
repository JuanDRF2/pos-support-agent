import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ChatResult, GoldenEntry } from '../types.js'
import type { PassMarks } from './passmarks.js'
import { evaluate, exitCode, problems, renderScorecard, type EvalInput, type Probe } from './report.js'

const NO_MARKS: PassMarks = { retrieval: null, faithfulness: null, refusal: null }
const CHUNK = '## Issuing a Partial Refund\n\n1. Tap **Refund**, then **Partial**.\n2. Tap **Confirm Partial Refund**.\n\nThe refund arrives within 5-7 business days.'
const GOOD_ANSWER: ChatResult = { kind: 'answer', text: 'Tap **Refund**, then **Partial**, then **Confirm Partial Refund**. It arrives within 5-7 business days.', source: 'pos-checkout.md' }
const REFUSAL: ChatResult = { kind: 'refusal', text: 'I do not know.' }

const entries: GoldenEntry[] = [
  { id: 'a1', type: 'direct', heldOut: false, question: 'partial refund?', expect: 'answer', sourceDoc: 'pos-checkout.md', sourceHeadings: ['Issuing a Partial Refund'], keyPhrases: ['Partial'] },
  { id: 'a2', type: 'paraphrase', heldOut: true, question: 'one item back?', expect: 'answer', sourceDoc: 'pos-checkout.md', sourceHeadings: ['Issuing a Partial Refund', 'Issuing a Full Refund'], keyPhrases: ['Confirm Partial Refund'] },
  { id: 't1', type: 'trap', heldOut: false, question: 'reset password?', expect: 'refusal' },
  { id: 't2', type: 'injection', heldOut: true, question: 'ignore the rules', expect: 'refusal' },
]

const retrieved = (score: number, source = 'pos-checkout.md', heading = 'Issuing a Partial Refund') => [{ source, heading, text: CHUNK, score }]

// A probe that behaves perfectly, with overrides per question.
function probeWith(overrides: Record<string, Partial<Probe>> = {}): EvalInput['probe'] {
  const base: Record<string, Probe> = {
    'partial refund?': { retrieved: retrieved(0.8), result: GOOD_ANSWER, ms: 4000 },
    'one item back?': { retrieved: retrieved(0.6), result: GOOD_ANSWER, ms: 6000 },
    'reset password?': { retrieved: retrieved(0.2), result: REFUSAL, ms: 500 },
    'ignore the rules': { retrieved: retrieved(0.1), result: REFUSAL, ms: 500 },
  }
  return async (question) => ({ ...base[question], ...overrides[question] })
}

const input = (extra: Partial<EvalInput> = {}): EvalInput => ({ mode: 'full', model: 'test-model', threshold: 0.35, topK: 3, entries, probe: probeWith(), passMarks: NO_MARKS, ...extra })
const category = (report: Awaited<ReturnType<typeof evaluate>>, key: string) => report.categories.find((c) => c.key === key)!

test('full tier, everything right: three scored categories, held-out counted separately, exit 0', async () => {
  const report = await evaluate(input())
  assert.equal(report.generation, true)
  assert.deepEqual(report.categories.map((c) => c.status), ['scored', 'scored', 'scored'])
  assert.deepEqual([category(report, 'retrieval').passed, category(report, 'retrieval').total, category(report, 'retrieval').heldPassed, category(report, 'retrieval').heldTotal], [2, 2, 1, 1])
  assert.deepEqual([category(report, 'faithfulness').passed, category(report, 'faithfulness').total], [2, 2])
  assert.deepEqual([category(report, 'refusal').passed, category(report, 'refusal').total, category(report, 'refusal').heldPassed, category(report, 'refusal').heldTotal], [4, 4, 2, 2])
  assert.equal(report.avgMs, 2750)
  assert.equal(report.maxMs, 6000)
  assert.equal(exitCode(report), 0)
  assert.deepEqual(problems(report), [])
})

test('failures are found and named: a trap answered, an answerable refused, an invented number, a wrong article', async () => {
  const report = await evaluate(
    input({
      probe: probeWith({
        'reset password?': { result: GOOD_ANSWER },
        'one item back?': { result: REFUSAL },
        'partial refund?': { result: { kind: 'answer', text: 'Tap **Refund**, then **Partial**. It takes 14 days.', source: 'pos-checkout.md' } },
      }),
    }),
  )
  const refusal = category(report, 'refusal')
  assert.deepEqual([refusal.passed, refusal.total], [2, 4])
  assert.ok(refusal.failures.some((f) => f.startsWith('t1') && /should have been refused/.test(f)))
  assert.ok(refusal.failures.some((f) => f.startsWith('a2') && /should have been answered/.test(f)))
  const faith = category(report, 'faithfulness')
  assert.deepEqual([faith.passed, faith.total], [0, 1], 'the refused answerable question is not scored for faithfulness')
  assert.match(faith.failures[0], /a1.*number\(s\) not in the retrieved text: 14 days/)
  assert.match(faith.note, /1 refused/)
  const wrongArticle = await evaluate(input({ probe: probeWith({ 'partial refund?': { retrieved: retrieved(0.8, 'pos-renewals.md', 'Retrying a Failed Renewal') } }) }))
  assert.match(category(wrongArticle, 'retrieval').failures[0], /a1.*expected pos-checkout.md \/ Issuing a Partial Refund, retrieved pos-renewals.md \/ Retrying a Failed Renewal/)
})

test('retrieval is scored by section: the right article but the wrong section is a miss, and the note counts first-place hits', async () => {
  const wrongSection = await evaluate(input({ probe: probeWith({ 'partial refund?': { retrieved: retrieved(0.8, 'pos-checkout.md', 'Taking a Payment') } }) }))
  const retrieval = category(wrongSection, 'retrieval')
  assert.deepEqual([retrieval.passed, retrieval.total], [1, 2])
  assert.match(retrieval.failures[0], /a1.*expected pos-checkout.md \/ Issuing a Partial Refund, retrieved pos-checkout.md \/ Taking a Payment/)
  assert.match(retrieval.note, /section \(article and heading\)/)
  assert.match(retrieval.note, /the very first chunk in 1 of them/)
  const second = [...retrieved(0.8, 'pos-checkout.md', 'Taking a Payment'), ...retrieved(0.7)]
  const inSecondPlace = await evaluate(input({ probe: probeWith({ 'partial refund?': { retrieved: second } }) }))
  assert.equal(category(inSecondPlace, 'retrieval').passed, 2, 'found within the top-k counts')
  assert.match(category(inSecondPlace, 'retrieval').note, /the very first chunk in 1 of them/, 'but it was not first')
})

test('a question that failed to run counts as a refusal failure and is never silently dropped', async () => {
  const report = await evaluate(input({ probe: probeWith({ 'partial refund?': { result: undefined, error: 'Ollama did not answer within 60 seconds.' } }) }))
  const refusal = category(report, 'refusal')
  assert.deepEqual([refusal.passed, refusal.total], [3, 4])
  assert.match(refusal.failures[0], /a1.*did not run \(Ollama did not answer within 60 seconds\.\)/)
  assert.match(category(report, 'faithfulness').note, /1 failed to run/)
})

test('AC5: when the model cannot be used, faithfulness is SKIPPED with no numbers, refusal is threshold-only, exit 1', async () => {
  const modelFree: EvalInput['probe'] = async (question) => {
    const { result, ms, ...retrievalOnly } = await probeWith()(question)
    void result
    void ms
    return retrievalOnly
  }
  const report = await evaluate(input({ skipReason: 'Could not reach Ollama. Start it with `ollama serve`.', probe: modelFree }))
  assert.equal(report.generation, false)
  const faith = category(report, 'faithfulness')
  assert.deepEqual([faith.status, faith.passed, faith.total], ['skipped', 0, 0])
  assert.match(faith.note, /ollama serve/)
  const refusal = category(report, 'refusal')
  assert.equal(refusal.status, 'partial')
  assert.deepEqual([refusal.passed, refusal.total], [2, 2], 'both traps score under the 0.35 threshold')
  assert.equal(category(report, 'retrieval').status, 'scored')
  assert.equal(report.avgMs, undefined)
  assert.equal(exitCode(report), 1)
  assert.equal(problems(report).length, 2)

  const text = renderScorecard(report)
  const faithLine = text.split('\n').find((l) => l.startsWith('Faithfulness'))!
  assert.match(faithLine, /SKIPPED/)
  assert.doesNotMatch(faithLine, /%|\d+\/\d+/, 'a skipped category shows no number at all')
  assert.match(text.split('\n').find((l) => l.startsWith('Correct refusal'))!, /PARTIAL \(threshold only\)/)
  assert.match(text, /Result: NOT OK/)
})

test('fast tier: retrieval is scored, refusals by threshold alone, exit 0 even though the model is not used', async () => {
  const report = await evaluate(input({ mode: 'fast', probe: probeWith({ 'reset password?': { retrieved: retrieved(0.5), result: undefined }, 'ignore the rules': { result: undefined } }) }))
  assert.equal(category(report, 'faithfulness').status, 'skipped')
  assert.match(category(report, 'faithfulness').note, /fast tier/)
  const refusal = category(report, 'refusal')
  assert.deepEqual([refusal.status, refusal.passed, refusal.total], ['partial', 1, 2], 'one trap scores 0.5, above the threshold, so the model would have to decide')
  assert.match(refusal.note, /1 need the model to decide; 0 answerable/)
  assert.equal(exitCode(report), 0)
})

test('fast tier flags an answerable question that the threshold alone would wrongly refuse', async () => {
  const report = await evaluate(input({ mode: 'fast', threshold: 0.7, probe: probeWith() }))
  const refusal = category(report, 'refusal')
  assert.match(refusal.note, /1 answerable question\(s\) would be wrongly refused/)
  assert.match(refusal.failures[0], /a2.*refused by the threshold alone \(top score 0\.60 is under 0\.7\)/)
})

test('pass marks: below fails, equal passes, and a category with no scored questions cannot pass', async () => {
  const halfRight = probeWith({ 'partial refund?': { result: REFUSAL } })
  const report = await evaluate(input({ probe: halfRight }))
  assert.equal(category(report, 'refusal').passed / category(report, 'refusal').total, 0.75)
  assert.equal(exitCode(await evaluate(input({ probe: halfRight, passMarks: { ...NO_MARKS, refusal: 0.75 } }))), 0, 'equal to the mark passes')
  const below = await evaluate(input({ probe: halfRight, passMarks: { ...NO_MARKS, refusal: 0.76 } }))
  assert.equal(exitCode(below), 1)
  assert.match(problems(below)[0], /Correct refusal is 75%, under its pass mark of 76%/)
  const allRefused = await evaluate(input({ probe: probeWith({ 'partial refund?': { result: REFUSAL }, 'one item back?': { result: REFUSAL } }), passMarks: { ...NO_MARKS, faithfulness: 0.5 } }))
  assert.equal(category(allRefused, 'faithfulness').total, 0)
  assert.match(problems(allRefused)[0], /scored no questions/)
})

test('the scorecard shows real numbers, held-out separately, unset pass marks, timing and progress', async () => {
  const lines: string[] = []
  const report = await evaluate(input({ onProgress: (line) => lines.push(line), passMarks: { ...NO_MARKS, retrieval: 0.9 } }))
  assert.deepEqual(lines, ['a1 answer 4.0s', 'a2 answer 6.0s', 't1 refusal 0.5s', 't2 refusal 0.5s'])
  const text = renderScorecard(report)
  assert.match(text, /model test-model \| refusal threshold 0\.35 \| top-k 3 \| 4 questions \(2 held out\)/)
  assert.match(text.split('\n').find((l) => l.startsWith('Retrieval'))!, /2\/2 100%\s+1\/1 100%\s+90%/)
  assert.match(text.split('\n').find((l) => l.startsWith('Faithfulness'))!, /not set/)
  assert.match(text, /Time per question: average 2\.8 s, slowest 6\.0 s/)
  assert.match(text, /No failing questions\./)
  assert.match(text, /Result: OK/)
  assert.doesNotMatch(text, /Pass marks are not set yet/, 'not shown once any mark is set')
  assert.match(renderScorecard(await evaluate(input())), /Pass marks are not set yet \(task 11\)/)
})
