import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { KB_FILES, MODEL_DIMENSIONS, MODEL_ID, MODEL_REVISION } from '../config.js'
import type { Chunk } from '../types.js'

export type IndexedChunk = Chunk & { embedding: number[] }

export type VectorIndex = {
  model: string
  revision: string
  dimensions: number
  chunks: IndexedChunk[]
}

export type ScoredChunk = { chunk: IndexedChunk; score: number }

export class IndexError extends Error {}

const REINGEST = 'Run `npm run ingest` to rebuild it.'

export function defaultIndexPath(): string {
  return new URL('../../data/index.json', import.meta.url).pathname
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseChunk(raw: unknown, position: number): IndexedChunk {
  const where = `chunk #${position}`
  if (!isRecord(raw)) throw new IndexError(`The index is corrupt (${where} is not an object). ${REINGEST}`)
  const { source, heading, text, embedding } = raw
  if (typeof source !== 'string' || !(KB_FILES as readonly string[]).includes(source)) throw new IndexError(`The index is corrupt (${where} has an unknown source). ${REINGEST}`)
  if (typeof heading !== 'string' || heading === '' || typeof text !== 'string' || text === '') throw new IndexError(`The index is corrupt (${where} has no heading or text). ${REINGEST}`)
  if (!Array.isArray(embedding) || embedding.length !== MODEL_DIMENSIONS || !embedding.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new IndexError(`The index is corrupt (${where} has an invalid embedding). ${REINGEST}`)
  }
  return { source, heading, text, embedding: embedding as number[] }
}

export function parseIndex(raw: unknown): VectorIndex {
  if (!isRecord(raw)) throw new IndexError(`The index is corrupt (not an object). ${REINGEST}`)
  if (raw.model !== MODEL_ID || raw.revision !== MODEL_REVISION || raw.dimensions !== MODEL_DIMENSIONS) {
    throw new IndexError(`The index was built with a different embedding model or revision. ${REINGEST}`)
  }
  if (!Array.isArray(raw.chunks) || raw.chunks.length === 0) throw new IndexError(`The index has no chunks. ${REINGEST}`)
  return { model: MODEL_ID, revision: MODEL_REVISION, dimensions: MODEL_DIMENSIONS, chunks: raw.chunks.map(parseChunk) }
}

export function saveIndex(path: string, chunks: IndexedChunk[]): void {
  const index: VectorIndex = { model: MODEL_ID, revision: MODEL_REVISION, dimensions: MODEL_DIMENSIONS, chunks }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(index))
}

export function loadIndex(path: string = defaultIndexPath()): VectorIndex {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    throw new IndexError(`The index file was not found. ${REINGEST}`)
  }
  try {
    return parseIndex(JSON.parse(text))
  } catch (error) {
    if (error instanceof IndexError) throw error
    throw new IndexError(`The index file is not valid JSON. ${REINGEST}`)
  }
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new IndexError('Vectors have different lengths.')
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Highest score first; ties keep the order of the index.
export function topK(index: VectorIndex, query: readonly number[], k: number): ScoredChunk[] {
  return index.chunks
    .map((chunk, order) => ({ chunk, score: cosine(chunk.embedding, query), order }))
    .sort((x, y) => y.score - x.score || x.order - y.order)
    .slice(0, Math.max(0, k))
    .map(({ chunk, score }) => ({ chunk, score }))
}
