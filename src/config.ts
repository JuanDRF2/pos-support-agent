// Single place for settings. Everything here is local: no hosted or keyed API.

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'
export const MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9'
export const MODEL_DIMENSIONS = 384

// Files the ingest step downloads once (over HTTPS) and verifies before use.
export const MODEL_FILES: Readonly<Record<string, string>> = {
  'config.json': '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7',
  'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
  'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
  'onnx/model_quantized.onnx': 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
}

export const KB_FILES = ['pos-checkout.md', 'pos-renewals.md', 'gift-renewal-pos.md'] as const

export const MAX_TOP_K = 5
export const MAX_ANSWER_CHARS = 1500
export const MAX_QUESTION_CHARS = 500
export const MAX_BODY_BYTES = 10 * 1024
export const OLLAMA_TIMEOUT_MS = 60_000
export const OLLAMA_NUM_PREDICT = 400
export const OLLAMA_SEED = 7
export const MAX_OLLAMA_RESPONSE_CHARS = 1_000_000

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export class ConfigError extends Error {}

export type Config = {
  ollamaUrl: string
  ollamaModel: string
  refusalThreshold: number
  topK: number
  port: number
}

// Only plain http on the loopback host is allowed. Parsed with URL, never string matching,
// so `http://localhost.evil.com` and `http://127.0.0.1@evil.com` are rejected.
export function parseOllamaUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError('OLLAMA_URL is not a valid URL.')
  }
  if (url.protocol !== 'http:') {
    throw new ConfigError('OLLAMA_URL must use http:// (Ollama runs locally).')
  }
  if (url.username !== '' || url.password !== '') {
    throw new ConfigError('OLLAMA_URL must not contain credentials.')
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new ConfigError('OLLAMA_URL must point to localhost, 127.0.0.1 or ::1.')
  }
  return url.origin
}

function parseNumber(name: string, raw: string, min: number, max: number, integer: boolean): number {
  const value = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new ConfigError(`${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`)
  }
  return value
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    ollamaUrl: parseOllamaUrl(env.OLLAMA_URL ?? 'http://127.0.0.1:11434'),
    ollamaModel: (env.OLLAMA_MODEL ?? 'llama3.2:3b').trim(),
    // 0.30, chosen in task 11: on the golden set every value from 0 to 0.40 gave the same result and 0.45
    // starts refusing a legitimate paraphrase (whose top score is 0.42), so this is the value that still
    // catches clearly off-topic questions before the model while keeping the widest margin from that cliff.
    refusalThreshold: parseNumber('REFUSAL_THRESHOLD', env.REFUSAL_THRESHOLD ?? '0.30', 0, 1, false),
    topK: parseNumber('TOP_K', env.TOP_K ?? '3', 1, MAX_TOP_K, true),
    port: parseNumber('PORT', env.PORT ?? '3000', 1024, 65535, true),
  }
}
