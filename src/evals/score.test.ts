import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KB_FILES } from '../config.js'
import { chunkMarkdown } from '../rag/chunker.js'
import { loadDocs } from '../rag/kb.js'
import type { ChatResult, GoldenEntry } from '../types.js'
import { describeFacts, extractFacts, extractOptions, normalize, retrievalRank, scoreFaithfulness, scoreRefusal, scoreRetrieval, type Answerable } from './score.js'

const partialRefund = chunkMarkdown('pos-checkout.md', loadDocs()['pos-checkout.md']).find((c) => c.heading === 'Issuing a Partial Refund')!.text
const giftChunk = chunkMarkdown('gift-renewal-pos.md', loadDocs()['gift-renewal-pos.md']).find((c) => c.heading === 'Gifting a Renewal')!.text

const refundEntry: Answerable = { id: 'g03', type: 'direct', heldOut: false, question: 'How do I process a partial refund?', expect: 'answer', sourceDoc: 'pos-checkout.md', sourceHeadings: ['Issuing a Partial Refund'], keyPhrases: ['Partial', 'Confirm Partial Refund'] }
const answer = (text: string, source: 'pos-checkout.md' | 'pos-renewals.md' | 'gift-renewal-pos.md' = 'pos-checkout.md'): Extract<ChatResult, { kind: 'answer' }> => ({ kind: 'answer', text, source })

const GOOD = [
  '1. Open **Order History** and select the order.',
  '2. Tap **Refund**, then tap **Partial**.',
  '3. Select the line items to refund.',
  '4. Tap **Confirm Partial Refund**.',
  'The refund returns within 5-7 business days for card payments. Partial refunds follow the same 30-day window as full refunds.',
].join('\n')

test('normalize ignores case, markdown emphasis, curly quotes, dashes and spacing', () => {
  assert.equal(normalize('  Tap **Confirm   Partial Refund**\n'), 'tap confirm partial refund')
  assert.equal(normalize('It’s “5–7” days'), 'it\'s "5-7" days')
})

test('extractFacts tags amounts, time periods and plain numbers, and skips list markers and step labels', () => {
  const facts = (text: string) => extractFacts(text).sort()
  assert.deepEqual(facts('within 5-7 business days'), ['num:5', 'num:7', 'time:5:day', 'time:7:day'])
  assert.deepEqual(facts('a 30-day window'), ['num:30', 'time:30:day'])
  assert.deepEqual(facts('within 30 days'), ['num:30', 'time:30:day'])
  assert.deepEqual(facts('costs $10.50 or $1,000 or 5 dollars'), ['amount:10.5', 'amount:1000', 'amount:5'])
  assert.deepEqual(facts('1. Open it\n2) Tap it\n3. Done'), [])
  assert.deepEqual(facts('Step 3: tap Refund. Steps 4-5 follow.'), [])
  assert.deepEqual(facts('two receipts within seven days'), ['num:2', 'num:7', 'time:7:day'])
  assert.deepEqual(facts('one item out of a multi-item order'), [])
  assert.deepEqual(facts('the code is 4321'), ['num:4321'])
})

test('describeFacts uses plain wording and does not repeat a number that a more specific fact names', () => {
  assert.deepEqual(describeFacts(['amount:5', 'time:14:day', 'num:14', 'num:30', 'time:1:week']), ['$5', '14 days', '30', '1 week'])
})

test('extractOptions finds bold labels and quoted names', () => {
  assert.deepEqual(extractOptions('Tap **Refund**, then **Confirm  Partial Refund** or "Void Sale" or “Cancel Order”.').sort(), ['cancel order', 'confirm partial refund', 'refund', 'void sale'])
  assert.deepEqual(extractOptions('plain text only'), [])
})

test('retrieval: the expected SECTION must be among the retrieved chunks, not just the article', () => {
  const partial = { source: 'pos-checkout.md', heading: 'Issuing a Partial Refund' }
  const fullRefund = { source: 'pos-checkout.md', heading: 'Issuing a Full Refund' }
  const otherArticle = { source: 'pos-renewals.md', heading: 'Retrying a Failed Renewal' }
  assert.equal(scoreRetrieval(refundEntry, [otherArticle, partial]), true)
  assert.equal(scoreRetrieval(refundEntry, [otherArticle, { source: 'gift-renewal-pos.md', heading: 'Gifting a Renewal' }]), false)
  assert.equal(scoreRetrieval(refundEntry, [fullRefund, { source: 'pos-checkout.md', heading: 'Taking a Payment' }]), false, 'right article, wrong section: a miss')
  assert.equal(scoreRetrieval(refundEntry, [{ source: 'pos-renewals.md', heading: 'Issuing a Partial Refund' }]), false, 'the same heading in another article does not count')
  assert.equal(scoreRetrieval(refundEntry, []), false)
})

test('retrievalRank gives the 1-based position, and any one of several accepted sections counts', () => {
  const partial = { source: 'pos-checkout.md', heading: 'Issuing a Partial Refund' }
  const full = { source: 'pos-checkout.md', heading: 'Issuing a Full Refund' }
  const other = { source: 'pos-renewals.md', heading: 'Retrying a Failed Renewal' }
  assert.equal(retrievalRank(refundEntry, [partial, other]), 1)
  assert.equal(retrievalRank(refundEntry, [other, other, partial]), 3)
  assert.equal(retrievalRank(refundEntry, [other, full]), undefined)
  const either: Answerable = { ...refundEntry, sourceHeadings: ['Issuing a Full Refund', 'Issuing a Partial Refund'] }
  assert.equal(retrievalRank(either, [other, full]), 2)
  assert.equal(retrievalRank(either, [partial]), 1)
})

test('refusal: traps must be refused and answerable questions must not be', () => {
  const trap: GoldenEntry = { id: 'g17', type: 'trap', heldOut: false, question: 'q', expect: 'refusal' }
  const refusal: ChatResult = { kind: 'refusal', text: 'no' }
  assert.equal(scoreRefusal(trap, refusal), true)
  assert.equal(scoreRefusal(trap, answer('steps')), false)
  assert.equal(scoreRefusal(refundEntry, answer('steps')), true)
  assert.equal(scoreRefusal(refundEntry, refusal), false)
})

test('AC10: a good answer passes all three faithfulness checks', () => {
  const detail = scoreFaithfulness(refundEntry, answer(GOOD), [partialRefund])
  assert.deepEqual(detail, { pass: true, sourceOk: true, missingPhrases: [], unsupportedNumbers: [], unsupportedOptions: [] })
})

test('AC10: an answer that invents a number fails check 3', () => {
  const cases: [string, string[]][] = [
    ['within 14 business days', ['14 days']],
    ['a 90-day window', ['90 days']],
    ['a fee of $5.00', ['$5']], // "5" exists in the article ("5-7 business days"), but never as an amount
    ['limited to 5 weeks', ['5 weeks']], // "5" exists, but never as weeks
    ['the code 4321', ['4321']],
  ]
  for (const [invented, expected] of cases) {
    const detail = scoreFaithfulness(refundEntry, answer(`${GOOD}\nIt is ${invented}.`), [partialRefund])
    assert.equal(detail.pass, false, invented)
    assert.deepEqual(detail.unsupportedNumbers, expected, invented)
    assert.deepEqual(detail.missingPhrases, [])
  }
})

test('repeating a number or name from the question is not inventing it, but adding another one still is', () => {
  const asked: Answerable = { ...refundEntry, question: 'Can I refund an order from six weeks ago, the "Blue Widget" one?' }
  const echoed = scoreFaithfulness(asked, answer(`${GOOD}\nSince the order is from six weeks ago (the "Blue Widget"), check the window.`), [partialRefund])
  assert.deepEqual(echoed.unsupportedNumbers, [])
  assert.deepEqual(echoed.unsupportedOptions, [])
  assert.equal(echoed.pass, true)
  const invented = scoreFaithfulness(asked, answer(`${GOOD}\nSince the order is from eight weeks ago, check the window.`), [partialRefund])
  assert.deepEqual(invented.unsupportedNumbers, ['8 weeks'])
})

test('an answer that invents a button or status name fails check 3', () => {
  const detail = scoreFaithfulness(refundEntry, answer(`${GOOD}\nThen tap **Void Sale** and see "Refund Pending".`), [partialRefund])
  assert.equal(detail.pass, false)
  assert.deepEqual(detail.unsupportedOptions.sort(), ['refund pending', 'void sale'])
})

test('check 1: citing the wrong article fails, even when the text is right', () => {
  const detail = scoreFaithfulness(refundEntry, answer(GOOD, 'pos-renewals.md'), [partialRefund])
  assert.equal(detail.pass, false)
  assert.equal(detail.sourceOk, false)
})

test('check 2: a missing key phrase fails, and markdown does not hide a present one', () => {
  const missing = scoreFaithfulness(refundEntry, answer('Open Order History and tap Refund.'), [partialRefund])
  assert.equal(missing.pass, false)
  assert.deepEqual(missing.missingPhrases, ['Partial', 'Confirm Partial Refund'])
  const bold = scoreFaithfulness(refundEntry, answer('Then tap **Confirm Partial Refund** for the **Partial** refund.'), [partialRefund])
  assert.deepEqual(bold.missingPhrases, [])
})

test('spelled-out numbers match digits in both directions, and renumbered steps or "Step N" labels are not facts', () => {
  const giftEntry: Answerable = { id: 'g07', type: 'direct', heldOut: false, question: 'q', expect: 'answer', sourceDoc: 'gift-renewal-pos.md', sourceHeadings: ['Gifting a Renewal'], keyPhrases: ['Gift Renewal'] }
  assert.equal(scoreFaithfulness(giftEntry, answer('Tap **Gift Renewal**. You get 2 receipts.', 'gift-renewal-pos.md'), [giftChunk]).pass, true, 'chunk says "two", answer says "2"')
  assert.equal(scoreFaithfulness(giftEntry, answer('Tap **Gift Renewal**. You get two receipts.', 'gift-renewal-pos.md'), [giftChunk]).pass, true)
  assert.equal(scoreFaithfulness(giftEntry, answer('Step 9: tap **Gift Renewal**.\n7) Take payment.', 'gift-renewal-pos.md'), [giftChunk]).pass, true)
  assert.equal(scoreFaithfulness(giftEntry, answer('Tap **Gift Renewal**. You get three receipts.', 'gift-renewal-pos.md'), [giftChunk]).pass, false)
})

test('sanity: the text of every real section, used as an answer, never trips the number or option check', () => {
  const docs = loadDocs()
  for (const file of KB_FILES) {
    for (const chunk of chunkMarkdown(file, docs[file])) {
      const entry: Answerable = { id: 'x', type: 'direct', heldOut: false, question: 'q', expect: 'answer', sourceDoc: file, sourceHeadings: [chunk.heading], keyPhrases: [chunk.heading] }
      const detail = scoreFaithfulness(entry, answer(chunk.text, file), [chunk.text])
      assert.deepEqual(detail, { pass: true, sourceOk: true, missingPhrases: [], unsupportedNumbers: [], unsupportedOptions: [] }, `${file} / ${chunk.heading}`)
    }
  }
})
