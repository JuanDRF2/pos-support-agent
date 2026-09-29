import type { Chunk } from '../types.js'

// One chunk per `##` section. A section is only split when it is longer than this, and only
// between blocks (paragraphs or whole numbered lists), never inside a numbered list.
export const MAX_CHUNK_CHARS = 1500

const NUMBERED_ITEM = /^\d+\.\s/
const CODE_FENCE = /^\s*(```|~~~)/
const H2 = /^## +(.+?)\s*$/

type Section = { heading: string; lines: string[] }

function splitSections(markdown: string): Section[] {
  const sections: Section[] = []
  let current: Section | undefined
  let inFence = false
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (CODE_FENCE.test(line)) inFence = !inFence
    const heading = inFence ? null : H2.exec(line)
    if (heading) {
      current = { heading: heading[1], lines: [] }
      sections.push(current)
    } else if (current) {
      current.lines.push(line)
    }
    // Lines before the first `##` (title and intro) are not indexed.
  }
  return sections
}

function isListBlock(block: string): boolean {
  return NUMBERED_ITEM.test(block)
}

// Blank-line separated blocks; consecutive list blocks (a "loose" list) and indented
// continuations of a list are merged so a numbered list is always one block.
function splitBlocks(body: string): string[] {
  const blocks: string[] = []
  for (const raw of body.split(/\n{2,}/)) {
    const block = raw.trim()
    if (block === '') continue
    const previous = blocks[blocks.length - 1]
    const continuesList = previous !== undefined && isListBlock(previous) && (isListBlock(block) || /^\s{2,}\S/.test(raw))
    if (continuesList) blocks[blocks.length - 1] = `${previous}\n\n${block}`
    else blocks.push(block)
  }
  return blocks
}

export function chunkMarkdown(source: string, markdown: string, maxChars: number = MAX_CHUNK_CHARS): Chunk[] {
  const chunks: Chunk[] = []
  for (const section of splitSections(markdown)) {
    const blocks = splitBlocks(section.lines.join('\n'))
    let current = ''
    const flush = () => {
      if (current !== '') chunks.push({ source, heading: section.heading, text: `${section.heading}\n\n${current}` })
      current = ''
    }
    for (const block of blocks) {
      if (current !== '' && current.length + 2 + block.length > maxChars) flush()
      current = current === '' ? block : `${current}\n\n${block}`
    }
    flush()
  }
  return chunks
}
