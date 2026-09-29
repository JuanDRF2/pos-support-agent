import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GoldenError, checkAgainstDocs, countByType, loadDocs, loadGolden, parseGolden } from './golden.js'

test('the golden set is valid and derived from the docs', () => {
  checkAgainstDocs(loadGolden(), loadDocs())
})

test('the golden set has direct, paraphrase, trap, injection and held-out questions', () => {
  const counts = countByType(loadGolden())
  assert.ok(counts.direct >= 5, 'direct')
  assert.ok(counts.paraphrase >= 5, 'paraphrase')
  assert.ok(counts.trap >= 4, 'trap')
  assert.ok(counts.injection >= 2, 'injection')
  assert.ok(counts.heldOut >= 4 && counts.heldOut <= 6, 'held-out is about 5')
  assert.ok(counts.total <= 25, 'capped at about 25 questions')
})

test('the two acceptance-criteria questions are in the set', () => {
  const questions = loadGolden().map((e) => e.question)
  assert.ok(questions.includes('How do I process a partial refund?'))
  assert.ok(questions.includes('How do I reset my POS password?'))
})

test('no KB article mentions password or gift cards (they must stay valid traps)', () => {
  for (const [file, text] of Object.entries(loadDocs())) {
    assert.ok(!/password/i.test(text), `${file} mentions password`)
    assert.ok(!/gift[ -]?card/i.test(text), `${file} mentions gift cards`)
  }
})

test('rejects malformed entries', () => {
  const answer = { id: 'x', type: 'direct', heldOut: false, question: 'q?', expect: 'answer', sourceDoc: 'pos-checkout.md', sourceHeadings: ['Issuing a Full Refund'], keyPhrases: ['Refund'] }
  assert.doesNotThrow(() => parseGolden([answer]))
  assert.throws(() => parseGolden({}), GoldenError)
  assert.throws(() => parseGolden([answer, answer]), GoldenError, 'duplicate id')
  assert.throws(() => parseGolden([{ ...answer, sourceDoc: 'other.md' }]), GoldenError)
  assert.throws(() => parseGolden([{ ...answer, keyPhrases: [] }]), GoldenError)
  assert.throws(() => parseGolden([{ ...answer, sourceHeadings: [] }]), GoldenError, 'needs at least one section')
  assert.throws(() => parseGolden([{ ...answer, sourceHeadings: undefined }]), GoldenError, 'sourceHeadings is required')
  assert.throws(() => parseGolden([{ ...answer, sourceHeadings: [''] }]), GoldenError)
  assert.throws(() => parseGolden([{ ...answer, keyPhrases: ['within thirty days'] }]), GoldenError, 'spelled-out number')
  assert.throws(() => parseGolden([{ ...answer, type: 'trap' }]), GoldenError, 'trap must expect refusal')
  assert.throws(() => parseGolden([{ ...answer, question: '' }]), GoldenError)
})

test('checkAgainstDocs catches a key phrase that is not in the source doc', () => {
  const entries = parseGolden([{ id: 'x', type: 'direct', heldOut: false, question: 'q?', expect: 'answer', sourceDoc: 'pos-checkout.md', sourceHeadings: ['Issuing a Full Refund'], keyPhrases: ['Not In The Doc'] }])
  assert.throws(() => checkAgainstDocs(entries, loadDocs()), GoldenError)
})

test('checkAgainstDocs catches an expected section that is not a heading of the source article', () => {
  const entry = { id: 'x', type: 'direct', heldOut: false, question: 'q?', expect: 'answer', sourceDoc: 'pos-checkout.md', keyPhrases: ['Refund'] }
  const wrongArticle = parseGolden([{ ...entry, sourceHeadings: ['Retrying a Failed Renewal'] }])
  assert.throws(() => checkAgainstDocs(wrongArticle, loadDocs()), /not a ## heading of pos-checkout\.md/)
  const typo = parseGolden([{ ...entry, sourceHeadings: ['Issuing a Full Refunds'] }])
  assert.throws(() => checkAgainstDocs(typo, loadDocs()), GoldenError)
})

test('every answerable question names at least one real section', () => {
  for (const entry of loadGolden()) if (entry.expect === 'answer') assert.ok(entry.sourceHeadings.length >= 1, entry.id)
})
