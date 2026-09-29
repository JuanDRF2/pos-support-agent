import { embed } from './embedder.js'
import { topK, type ScoredChunk, type VectorIndex } from './store.js'

// Embeds the question on its own (the same way ingest embeds each chunk) and returns the top-k chunks.
export async function retrieve(
  question: string,
  index: VectorIndex,
  k: number,
  embedFn: (texts: string[]) => Promise<number[][]> = embed,
): Promise<ScoredChunk[]> {
  const text = question.trim()
  if (text === '') throw new Error('Cannot retrieve for an empty question.')
  const [vector] = await embedFn([text])
  if (vector === undefined) throw new Error('The embedder returned no vector for the question.')
  return topK(index, vector, k)
}
