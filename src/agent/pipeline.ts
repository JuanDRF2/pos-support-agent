import type { Config } from '../config.js'
import { embed } from '../rag/embedder.js'
import { retrieve } from '../rag/retrieve.js'
import { loadIndex, type ScoredChunk, type VectorIndex } from '../rag/store.js'
import type { ChatResult } from '../types.js'
import { answer, type Prompt } from './answer.js'
import { createGenerator } from './ollama.js'

export type PipelineOverrides = {
  index?: VectorIndex
  embedFn?: (texts: string[]) => Promise<number[][]>
  generate?: (prompt: Prompt) => Promise<string>
  // Called with exactly the chunks retrieved for each question (the evals score the answer against them).
  onRetrieved?: (chunks: ScoredChunk[]) => void
}

// The single-turn chat pipeline: the server and the evals both call this same function.
export function createPipeline(config: Config, overrides: PipelineOverrides = {}): (question: string) => Promise<ChatResult> {
  const index = overrides.index ?? loadIndex()
  const generate = overrides.generate ?? createGenerator({ baseUrl: config.ollamaUrl, model: config.ollamaModel })
  return (question) =>
    answer(question, {
      retrieve: async (cleaned) => {
        const chunks = await retrieve(cleaned, index, config.topK, overrides.embedFn ?? embed)
        overrides.onRetrieved?.(chunks)
        return chunks
      },
      generate,
      refusalThreshold: config.refusalThreshold,
    })
}
