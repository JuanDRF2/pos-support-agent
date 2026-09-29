// Talks to the REAL local Ollama, so it is not part of `test:unit` or `genesis verify`.
// Run it with: npx tsx --test src/agent/ollama.live.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../config.js'
import { OllamaError, checkOllama, createGenerator } from './ollama.js'

test('real Ollama answers a tiny prompt with the configured model', async (t) => {
  const config = loadConfig()
  try {
    await checkOllama(config.ollamaUrl, config.ollamaModel)
  } catch (error) {
    if (error instanceof OllamaError) {
      t.skip(`${error.message} (start Ollama and pull the model to run this)`)
      return
    }
    throw error
  }
  const reply = await createGenerator({ baseUrl: config.ollamaUrl, model: config.ollamaModel })({
    system: 'Reply with the single word OK.',
    user: 'Say it.',
  })
  assert.ok(reply.trim().length > 0)
})
