import { MAX_OLLAMA_RESPONSE_CHARS, OLLAMA_NUM_PREDICT, OLLAMA_SEED, OLLAMA_TIMEOUT_MS, parseOllamaUrl } from '../config.js'
import type { Prompt } from './answer.js'

export type OllamaErrorCode = 'unreachable' | 'model_missing' | 'timeout' | 'http' | 'bad_response'

// Messages are written for the person running the app. They never include the prompt, the
// question or anything the server sent back.
export class OllamaError extends Error {
  constructor(message: string, readonly code: OllamaErrorCode) {
    super(message)
  }
}

export type OllamaOptions = {
  baseUrl: string
  model: string
  timeoutMs?: number
  numPredict?: number
  fetchFn?: typeof fetch
}

const START_HINT = 'Start it with `ollama serve` (or open the Ollama app).'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function request(url: string, init: RequestInit, timeoutMs: number, fetchFn: typeof fetch): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(url, { ...init, redirect: 'error', signal: controller.signal })
    if (response.status === 404) throw new OllamaError('Ollama does not have that model.', 'model_missing')
    if (!response.ok) throw new OllamaError(`Ollama returned an error (HTTP ${response.status}).`, 'http')
    const text = await response.text()
    if (text.length > MAX_OLLAMA_RESPONSE_CHARS) throw new OllamaError('Ollama sent a response that is too large.', 'bad_response')
    return text
  } catch (error) {
    if (error instanceof OllamaError) throw error
    if (controller.signal.aborted) throw new OllamaError(`Ollama did not answer within ${Math.round(timeoutMs / 1000)} seconds.`, 'timeout')
    throw new OllamaError(`Could not reach Ollama. ${START_HINT}`, 'unreachable')
  } finally {
    clearTimeout(timer)
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new OllamaError('Ollama sent a reply that is not valid JSON.', 'bad_response')
  }
}

// The base URL is validated again here, so this client can never be pointed at a non-local host.
export function createGenerator(options: OllamaOptions): (prompt: Prompt) => Promise<string> {
  const baseUrl = parseOllamaUrl(options.baseUrl)
  const fetchFn = options.fetchFn ?? fetch
  const timeoutMs = options.timeoutMs ?? OLLAMA_TIMEOUT_MS
  const numPredict = options.numPredict ?? OLLAMA_NUM_PREDICT
  return async (prompt) => {
    let text: string
    try {
      text = await request(
        `${baseUrl}/api/chat`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: options.model,
            stream: false,
            options: { temperature: 0, seed: OLLAMA_SEED, num_predict: numPredict },
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
          }),
        },
        timeoutMs,
        fetchFn,
      )
    } catch (error) {
      if (error instanceof OllamaError && error.code === 'model_missing') {
        throw new OllamaError(`The model "${options.model}" is not installed. Run: ollama pull ${options.model}`, 'model_missing')
      }
      throw error
    }
    const body = parseJson(text)
    const message = isRecord(body) ? body.message : undefined
    if (!isRecord(message) || typeof message.content !== 'string') throw new OllamaError('Ollama sent a reply in an unexpected shape.', 'bad_response')
    return message.content
  }
}

// Startup check: Ollama is running and the configured model is installed.
export async function checkOllama(baseUrlRaw: string, model: string, fetchFn: typeof fetch = fetch, timeoutMs = 5_000): Promise<void> {
  const baseUrl = parseOllamaUrl(baseUrlRaw)
  const body = parseJson(await request(`${baseUrl}/api/tags`, { method: 'GET' }, timeoutMs, fetchFn))
  const models = isRecord(body) && Array.isArray(body.models) ? body.models : undefined
  if (models === undefined) throw new OllamaError('Ollama sent a reply in an unexpected shape.', 'bad_response')
  const wanted = model.includes(':') ? model : `${model}:latest`
  const installed = models.some((entry) => isRecord(entry) && (entry.name === wanted || entry.model === wanted))
  if (!installed) throw new OllamaError(`The model "${model}" is not installed. Run: ollama pull ${model}`, 'model_missing')
}
