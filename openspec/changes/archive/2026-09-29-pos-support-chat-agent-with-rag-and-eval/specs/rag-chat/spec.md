# rag-chat

## ADDED Requirements

### Requirement: Single-turn grounded answer with source
The system SHALL answer a merchant question from retrieved chunks using a local Ollama model (`llama3.2:3b` by default, set by env var, temperature 0, fixed seed; see decision D4 as amended) and return `{ kind: 'answer', text, source }`. The page SHALL show `Source: <file>.md`.

#### Scenario: Partial refund
- **Given** the index is built and Ollama is running
- **When** the user asks "how do I process a partial refund?"
- **Then** the answer gives the correct steps and cites `pos-checkout.md`

### Requirement: Refusal decided in code
`answer()` SHALL return `{ kind: 'refusal', text }` without calling the model when the top cosine score is below the configured threshold, and SHALL also return a refusal when the model replies `NOT_IN_DOCS`.

#### Scenario: Out-of-scope question
- **Given** the same setup
- **When** the user asks "how do I reset my POS password?"
- **Then** the reply is the canned refusal suggesting contact with support, with no invented steps

#### Scenario: Below threshold never reaches the model
- **Given** a stubbed retriever returning a low top score
- **When** `answer()` runs with a generator stub that fails if called
- **Then** it returns a refusal and the stub is never called

### Requirement: Result type is a discriminated union
The system SHALL model results as `ChatResult = answer | refusal` with `kind` as the discriminant, checked by `tsc`.

### Requirement: Local-only HTTP surface
The server SHALL use Node built-in `http`, bind to `127.0.0.1`, expose one `POST /api/chat` and one static `index.html` on fixed routes (every other URL returns 404; no file path is built from the URL), reject bodies over 10 KB with 413 enforced while streaming, and reject questions over about 500 characters with 400. It SHALL reject any request whose `Host` is not `127.0.0.1:PORT` or `localhost:PORT` (403), require `Content-Type: application/json` and a matching own-origin `Origin` when one is present, send no CORS headers, allow one generation at a time (429 for a concurrent second), apply header/request timeouts, and send a Content-Security-Policy and `X-Content-Type-Options: nosniff`. The page SHALL render text with `textContent` only.

#### Scenario: Foreign Host header (DNS rebinding)
- **Given** the server is running
- **When** a request arrives with `Host: evil.example`
- **Then** the response is 403

#### Scenario: Foreign origin or wrong content type
- **Given** the server is running
- **When** `POST /api/chat` arrives with a foreign `Origin` or `Content-Type: text/plain`
- **Then** it is rejected and no generation starts

#### Scenario: Concurrent generation
- **Given** one generation is in flight
- **When** a second request arrives
- **Then** the response is 429

### Requirement: Ollama URL is local-only and hard-validated
The system SHALL parse `OLLAMA_URL` with `new URL()` and refuse to start unless the scheme is `http` and the hostname is exactly `localhost`, `127.0.0.1` or `::1`. The Ollama call SHALL use `redirect: 'error'`, a 60 s timeout and a `num_predict` cap.

#### Scenario: Bypass strings rejected
- **Given** `OLLAMA_URL` is `http://localhost.evil.com` or `http://127.0.0.1@evil.com`
- **When** the app starts
- **Then** it fails with a plain message and sends nothing

### Requirement: Source line comes from metadata
The `Source: <file>.md` shown to the user SHALL come from retrieved chunk metadata and be one of the three known KB files, never from model text.

#### Scenario: Oversized body
- **Given** the server is running
- **When** a body over 10 KB is posted
- **Then** the response is 413

#### Scenario: Loopback bind
- **Given** the server is running
- **When** its listening address is inspected
- **Then** it is `127.0.0.1`

#### Scenario: HTML in a reply
- **Given** a reply containing `<img src=x onerror=alert(1)>`
- **When** the page renders it
- **Then** it is shown as literal text

### Requirement: No question text in logs
The system SHALL log only counts, scores and timings, never question text.

#### Scenario: Marker string
- **Given** a question containing a unique marker
- **When** the server output is read
- **Then** the marker does not appear

### Requirement: No hosted or paid API
The system SHALL NOT depend on Claude, Anthropic, Voyage or any keyed or hosted API, and SHALL call Ollama with plain `fetch` (no SDK).

#### Scenario: Repo search
- **Given** the finished code
- **When** it is searched for hosted-API SDKs and URLs
- **Then** there are none (Ollama on localhost is the documented HTTP exception)
