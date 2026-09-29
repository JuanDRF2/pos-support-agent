import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { OllamaError } from '../agent/ollama.js'
import { MAX_BODY_BYTES, MAX_QUESTION_CHARS } from '../config.js'
import { ModelError } from '../rag/embedder.js'
import { IndexError } from '../rag/store.js'
import type { ChatResult } from '../types.js'

// Only this computer can reach the app: the server listens on the loopback address and nothing else.
export const HOST = '127.0.0.1'

export type AppDeps = {
  ask: (question: string) => Promise<ChatResult>
  // Receives counts, kinds and timings only. Never question text, request bodies or prompts.
  log?: (line: string) => void
  headersTimeoutMs?: number
  requestTimeoutMs?: number
}

const PAGE_URL = new URL('./index.html', import.meta.url)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// The page has one inline <script> and one inline <style>. Their sha256 goes into the CSP, so
// nothing else can run or style the page, and 'unsafe-inline' is never needed.
function inlineHash(html: string, tag: 'script' | 'style'): string {
  const matches = [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))]
  if (matches.length !== 1) throw new Error(`index.html must contain exactly one inline <${tag}>.`)
  return `'sha256-${createHash('sha256').update(matches[0][1]).digest('base64')}'`
}

export function contentSecurityPolicy(html: string): string {
  return [
    "default-src 'none'",
    `script-src ${inlineHash(html, 'script')}`,
    `style-src ${inlineHash(html, 'style')}`,
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

const SECURITY_HEADERS = { 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string>): void {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers })
  res.end(body)
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  send(res, status, JSON.stringify(body), { 'content-type': 'application/json; charset=utf-8', ...headers })
}

// Used while the request body has not been fully read: answer, then cut the connection.
function rejectAndClose(req: IncomingMessage, res: ServerResponse, status: number, error: string): void {
  res.once('finish', () => req.socket.destroy())
  sendJson(res, status, { error }, { connection: 'close' })
}

type Body = { ok: true; text: string } | { ok: false; reason: 'too_large' | 'aborted' }

// The cap is enforced while the body streams in, so an oversized upload is never buffered.
function readBody(req: IncomingMessage): Promise<Body> {
  return new Promise((resolve) => {
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return resolve({ ok: false, reason: 'too_large' })
    const chunks: Buffer[] = []
    let size = 0
    let done = false
    const finish = (result: Body) => {
      if (done) return
      done = true
      req.removeAllListeners('data')
      resolve(result)
    }
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) return finish({ ok: false, reason: 'too_large' })
      chunks.push(chunk)
    })
    req.on('end', () => finish({ ok: true, text: Buffer.concat(chunks).toString('utf8') }))
    req.on('error', () => finish({ ok: false, reason: 'aborted' }))
    req.on('close', () => finish({ ok: false, reason: 'aborted' }))
  })
}

function parseQuestion(text: string): { ok: true; question: string } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Send a JSON object with one "question" text field.' }
  }
  if (!isRecord(parsed) || Object.keys(parsed).length !== 1 || typeof parsed.question !== 'string') {
    return { ok: false, error: 'Send a JSON object with one "question" text field.' }
  }
  const question = parsed.question.trim()
  if (question === '') return { ok: false, error: 'Please type a question.' }
  if (question.length > MAX_QUESTION_CHARS) return { ok: false, error: `Please keep your question under ${MAX_QUESTION_CHARS} characters.` }
  return { ok: true, question }
}

export function createApp(deps: AppDeps): Server {
  const html = readFileSync(PAGE_URL, 'utf8')
  const csp = contentSecurityPolicy(html)
  const log = deps.log ?? (() => undefined)
  let busy = false

  async function chat(req: IncomingMessage, res: ServerResponse, origins: string[]): Promise<void> {
    const origin = req.headers.origin
    if (origin !== undefined && !origins.includes(origin.toLowerCase())) return rejectAndClose(req, res, 403, 'Forbidden origin.')
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (type !== 'application/json') return rejectAndClose(req, res, 415, 'Content-Type must be application/json.')

    const body = await readBody(req)
    if (!body.ok) {
      if (body.reason === 'too_large') return rejectAndClose(req, res, 413, 'That request is too large.')
      return
    }
    const parsed = parseQuestion(body.text)
    if (!parsed.ok) return sendJson(res, 400, { error: parsed.error })

    // Everything up to here is synchronous after the body arrives, so this check cannot race.
    if (busy) return sendJson(res, 429, { error: 'Still answering the previous question. Please try again in a moment.' }, { 'retry-after': '2' })
    busy = true
    const started = performance.now()
    try {
      const result = await deps.ask(parsed.question)
      log(`chat kind=${result.kind} ms=${Math.round(performance.now() - started)}`)
      sendJson(res, 200, result.kind === 'answer' ? { kind: 'answer', text: result.text, source: result.source } : { kind: 'refusal', text: result.text })
    } catch (error) {
      log(`chat error=${error instanceof Error ? error.constructor.name : 'unknown'} ms=${Math.round(performance.now() - started)}`)
      // These errors are written for the person running the app and never contain the question.
      if (error instanceof OllamaError || error instanceof ModelError || error instanceof IndexError) sendJson(res, 503, { error: error.message })
      else sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
    } finally {
      busy = false
    }
  }

  // Node only checks connection timeouts every `connectionsCheckingInterval` (30 s by default), which
  // would let a slow-dripped request live far longer than requestTimeout; check every second instead.
  const server = createServer({ maxHeaderSize: 8192, connectionsCheckingInterval: 1_000 }, (req, res) => {
    // Fixed routes only: the URL is compared, never turned into a file path.
    const path = (req.url ?? '').split('?')[0]
    const port = req.socket.localPort
    const host = (req.headers.host ?? '').toLowerCase()
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`]
    if (!hosts.includes(host)) return sendJson(res, 403, { error: 'Forbidden host.' })

    if (path === '/' || path === '/index.html') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' }, { allow: 'GET' })
      return send(res, 200, html, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp })
    }
    if (path === '/api/chat') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' }, { allow: 'POST' })
      chat(req, res, hosts.map((h) => `http://${h}`)).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
      })
      return
    }
    sendJson(res, 404, { error: 'Not found.' })
  })
  server.headersTimeout = deps.headersTimeoutMs ?? 10_000
  server.requestTimeout = deps.requestTimeoutMs ?? 15_000
  server.keepAliveTimeout = 5_000
  return server
}

export function startServer(server: Server, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'EADDRINUSE' ? new Error(`Port ${port} is already in use. Set PORT to another number.`) : error)
    })
    server.listen(port, HOST, () => resolve(server))
  })
}
