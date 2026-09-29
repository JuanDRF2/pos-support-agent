import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KB_FILES } from '../config.js'
import { loadDocs } from '../evals/golden.js'
import type { Chunk } from '../types.js'
import { chunkMarkdown } from './chunker.js'

const bodyOf = (chunk: Chunk) => chunk.text.slice(chunk.text.indexOf('\n\n') + 2)
const lastLine = (chunk: Chunk) => bodyOf(chunk).trimEnd().split('\n').pop() ?? ''
const firstLine = (chunk: Chunk) => bodyOf(chunk).split('\n')[0] ?? ''

// A chunk ends mid-list when it ends on a numbered item and the next chunk of the same
// section carries on with more list items.
function endsMidList(chunks: Chunk[]): boolean {
  return chunks.some((chunk, i) => {
    const next = chunks[i + 1]
    return next !== undefined && next.source === chunk.source && next.heading === chunk.heading && /^\d+\.\s/.test(lastLine(chunk)) && /^\d+\.\s/.test(firstLine(next))
  })
}

test('the mid-list detector really catches a bad split (guards the test itself)', () => {
  const bad: Chunk[] = [
    { source: 'd.md', heading: 'H', text: 'H\n\n1. one\n2. two' },
    { source: 'd.md', heading: 'H', text: 'H\n\n3. three' },
  ]
  const fine: Chunk[] = [
    { source: 'd.md', heading: 'H', text: 'H\n\n1. one\n2. two' },
    { source: 'd.md', heading: 'H', text: 'H\n\nA closing paragraph.' },
  ]
  assert.equal(endsMidList(bad), true)
  assert.equal(endsMidList(fine), false)
})

test('each ## section of the real articles is exactly one chunk', () => {
  for (const [file, markdown] of Object.entries(loadDocs())) {
    const headings = [...markdown.matchAll(/^## +(.+?)\s*$/gm)].map((m) => m[1])
    const chunks = chunkMarkdown(file, markdown)
    assert.deepEqual(chunks.map((c) => c.heading), headings, file)
    assert.ok(chunks.every((c) => c.source === file))
  }
})

test('the partial refund procedure stays together with all six steps', () => {
  const chunks = chunkMarkdown('pos-checkout.md', loadDocs()['pos-checkout.md'])
  const partial = chunks.find((c) => c.heading === 'Issuing a Partial Refund')
  assert.ok(partial)
  for (const step of ['1. Open', '2. Tap', '3. Either', '4. Review', '5. Tap', '6. The refunded']) {
    assert.ok(partial.text.includes(step), step)
  }
  assert.ok(partial.text.includes('30-day window'))
})

test('no chunk of the real articles ends mid numbered list, even with a tiny size limit', () => {
  for (const file of KB_FILES) {
    for (const max of [1500, 400, 100, 1]) {
      assert.equal(endsMidList(chunkMarkdown(file, loadDocs()[file], max)), false, `${file} max=${max}`)
    }
  }
})

test('a long list-heavy section splits between blocks but keeps the list whole', () => {
  const items = Array.from({ length: 12 }, (_, i) => `${i + 1}. Step number ${i + 1} does something useful.`).join('\n')
  const markdown = `# Title\n\nintro\n\n## Long\n\nFirst paragraph about the topic.\n\n${items}\n\nA closing paragraph.\n\nAnother closing paragraph.`
  const chunks = chunkMarkdown('doc.md', markdown, 200)
  assert.ok(chunks.length > 1, 'section was split')
  assert.equal(endsMidList(chunks), false)
  const withList = chunks.filter((c) => /^\d+\.\s/m.test(c.text))
  assert.equal(withList.length, 1, 'the list is in a single chunk')
  assert.ok(withList[0].text.includes('12. Step number 12'))
  assert.ok(chunks.every((c) => c.heading === 'Long'))
})

test('a loose list (blank lines between items) is still one block', () => {
  const markdown = '## Loose\n\n1. First.\n\n2. Second.\n\n3. Third.\n\nDone.'
  const chunks = chunkMarkdown('doc.md', markdown, 20)
  assert.equal(endsMidList(chunks), false)
  assert.equal(chunks.filter((c) => /^\d+\.\s/m.test(c.text)).length, 1)
})

test('title and intro before the first ## are not indexed; ### stays inside its section', () => {
  const chunks = chunkMarkdown('doc.md', '# Title\n\nIntro line.\n\n## A\n\nBody A.\n\n### Sub\n\nSub body.\n\n## B\n\nBody B.')
  assert.deepEqual(chunks.map((c) => c.heading), ['A', 'B'])
  assert.ok(chunks[0].text.includes('### Sub') && chunks[0].text.includes('Sub body.'))
  assert.ok(chunks.every((c) => !c.text.includes('Intro line.')))
})

test('a ## inside a code fence is not a heading; CRLF input works; empty sections are skipped', () => {
  const markdown = '## Real\r\n\r\n```\r\n## not a heading\r\n```\r\n\r\n## Empty\r\n\r\n## Last\r\n\r\nText.'
  const chunks = chunkMarkdown('doc.md', markdown)
  assert.deepEqual(chunks.map((c) => c.heading), ['Real', 'Last'])
  assert.ok(chunks[0].text.includes('## not a heading'))
})
