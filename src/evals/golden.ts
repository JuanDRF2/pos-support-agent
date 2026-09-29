import { readFileSync } from 'node:fs'
import { KB_FILES, MAX_QUESTION_CHARS } from '../config.js'
import type { GoldenEntry, GoldenType, KbFile } from '../types.js'

const TYPES: readonly GoldenType[] = ['direct', 'paraphrase', 'trap', 'injection']
// Spelled-out numbers make the deterministic faithfulness check flaky, so key phrases use digits.
const SPELLED_NUMBER = /\b(zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/i

export class GoldenError extends Error {}

function fail(id: string, message: string): never {
  throw new GoldenError(`golden ${id}: ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEntry(raw: unknown, index: number): GoldenEntry {
  if (!isRecord(raw)) throw new GoldenError(`golden entry #${index} is not an object`)
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : `#${index}`
  const { type, question, heldOut, expect } = raw
  if (typeof type !== 'string' || !(TYPES as readonly string[]).includes(type)) fail(id, 'invalid type')
  if (typeof question !== 'string' || question.trim() === '' || question.length > MAX_QUESTION_CHARS) fail(id, 'question must be a non-empty string within the length cap')
  if (typeof heldOut !== 'boolean') fail(id, 'heldOut must be a boolean')
  const base = { id, question, heldOut }

  if (type === 'trap' || type === 'injection') {
    if (expect !== 'refusal') fail(id, `${type} entries must expect a refusal`)
    return { ...base, type, expect: 'refusal' }
  }
  if (expect !== 'answer') fail(id, `${type} entries must expect an answer`)
  const { sourceDoc, sourceHeadings, keyPhrases } = raw
  if (typeof sourceDoc !== 'string' || !(KB_FILES as readonly string[]).includes(sourceDoc)) fail(id, 'sourceDoc must be one of the three KB files')
  if (!Array.isArray(sourceHeadings) || sourceHeadings.length === 0 || !sourceHeadings.every((h) => typeof h === 'string' && h.trim() !== '')) fail(id, 'sourceHeadings must be a non-empty list of section headings')
  if (!Array.isArray(keyPhrases) || keyPhrases.length === 0 || !keyPhrases.every((p) => typeof p === 'string' && p.trim() !== '')) fail(id, 'keyPhrases must be a non-empty list of strings')
  const phrases = keyPhrases as string[]
  for (const phrase of phrases) if (SPELLED_NUMBER.test(phrase)) fail(id, `key phrase "${phrase}" contains a spelled-out number; use digits`)
  return { ...base, type: type as 'direct' | 'paraphrase', expect: 'answer', sourceDoc: sourceDoc as KbFile, sourceHeadings: sourceHeadings as string[], keyPhrases: phrases }
}

export function parseGolden(raw: unknown): GoldenEntry[] {
  if (!Array.isArray(raw)) throw new GoldenError('golden set must be a JSON array')
  const entries = raw.map(parseEntry)
  const ids = new Set<string>()
  for (const entry of entries) {
    if (ids.has(entry.id)) fail(entry.id, 'duplicate id')
    ids.add(entry.id)
  }
  return entries
}

// The golden set must be derived from the docs: every key phrase has to appear in its source article.
export function checkAgainstDocs(entries: GoldenEntry[], docs: Record<string, string>): void {
  for (const entry of entries) {
    if (entry.expect !== 'answer') continue
    const doc = docs[entry.sourceDoc]
    if (doc === undefined) fail(entry.id, `source doc ${entry.sourceDoc} was not provided`)
    const headings = [...doc.matchAll(/^## +(.+?)\s*$/gm)].map((m) => m[1])
    for (const heading of entry.sourceHeadings) {
      if (!headings.includes(heading)) fail(entry.id, `section "${heading}" is not a ## heading of ${entry.sourceDoc}`)
    }
    for (const phrase of entry.keyPhrases) {
      if (!doc.toLowerCase().includes(phrase.toLowerCase())) fail(entry.id, `key phrase "${phrase}" is not in ${entry.sourceDoc}`)
    }
  }
}

export function loadGolden(): GoldenEntry[] {
  return parseGolden(JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8')))
}

export { loadDocs } from '../rag/kb.js'

export function countByType(entries: GoldenEntry[]): Record<GoldenType | 'heldOut' | 'total', number> {
  const counts = { direct: 0, paraphrase: 0, trap: 0, injection: 0, heldOut: 0, total: entries.length }
  for (const entry of entries) {
    counts[entry.type] += 1
    if (entry.heldOut) counts.heldOut += 1
  }
  return counts
}
