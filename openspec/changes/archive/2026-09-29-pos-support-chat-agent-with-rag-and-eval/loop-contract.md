# Loop Contract — POS support chat agent with RAG and evals

The autonomy contract for this initiative: the goal, how "done" is verified, and —
most importantly — the breakpoints where the build loop must stop and pull in a
human. Set the final line to `Status: Ready` only after the plan has been reviewed.

**Planning source:** `openspec/changes/pos-support-chat-agent-with-rag-and-eval/proposal.md` (approved; decisions D1-D6, risks, success criteria and the root-config table are taken from it, not restated in full). Spec deltas are in `specs/`, tasks in `tasks.md`.

**Where this plan supersedes the approved proposal (decided after the security audit; signing GATE 2 approves these differences):**
- `OLLAMA_URL`: the proposal says "validated as local or a warning is logged"; the plan **hard-fails** on anything but `http` + `localhost`/`127.0.0.1`/`::1` (AC15).
- Dependency: the proposal says "major pinned"; the plan pins an **exact version** and commits `package-lock.json`.
- `.gitignore` also gets `.env.*` with `!.env.example`; `.env.example` holds names plus safe local defaults (not "no values").
- `package.json` also gets the `verify` script (D7).
- Extra hardening: server rules in AC7, pinned model revision in AC15, and the security rules under Scope & no-gos.
- **D4 amended by measurement (during the build):** the proposal says "7-8B Ollama model"; the default is now `llama3.2:3b` because the 7-8B model was too slow on this machine. Not a preference change. Details and numbers in `planning/decisions.md`.

## Goal
**Who it's for:** Juan, as a portfolio demo (an internal tool, not for real merchants). It is a single-turn POS support chat that answers merchant questions such as partial refund, renewing a subscription and gifting a renewal.

**The real problem:** merchants either search docs or wait for a human, which is slow and inconsistent. The demo shows the fix can be done with **real retrieval (RAG)** over three help articles and **real, repeatable evals**, entirely on Juan's laptop, with no cost and no API key.

**Design & references:** no Figma, Lovable project or screenshots were captured. The design gate was skipped by Juan's decision (D5) and recorded as `design set none`. The screen is defined in text in the proposal (one centred "POS Support" column, messages right-aligned for the user and left-aligned for the agent, a `Source: <file>.md` line under answers, a "thinking..." state, a plain error if Ollama is down, no history). The build follows that description and nothing else. If Juan wants a specific look later, that is a separate small initiative.

**Decisions (all closed; details in the proposal):**
- D1 Local embeddings (`Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers`) instead of Voyage.
- D2 Chat answers from Ollama instead of Claude.
- D3 Deterministic faithfulness checks instead of an LLM judge.
- D4 An Ollama model set by env var. **Amended after measurement:** originally a 7-8B model; on this 8 GB Mac `llama3.1:8b` measured 51 s to load and 13.4 s for 2 tokens, so the default is now `llama3.2:3b` (see `planning/decisions.md`).
- D5 Design gate skipped.
- D6 Refusal decided in code (score threshold plus the `NOT_IN_DOCS` sentinel).
- D1-D3 **amend `AGENTS.md`**, which still says Voyage and Claude. The amendment is task 2.1 and is recorded as MODIFIED in the spec deltas.
- **D7 (new in this plan, not in the approved proposal's root-config table):** `npm test` is the full suite (needs Ollama). A new `verify` script makes `genesis verify` run only the fast tier (no LLM). Reason: the ledger runs a `verify` script instead of typecheck/lint/test/build when one exists. Approving GATE 2 on these files approves this addition.
- Parked with a reason: multi-turn memory, hosting and auth (out of scope; hosting would be a new Lane B initiative).

## Acceptance criteria
Each criterion is testable and written as Given / When / Then, so the loop can re-verify it
every iteration.
- [x] **AC1 Partial refund.** Given the index is built and Ollama is running with the configured model, when I ask "how do I process a partial refund?", then the answer states the correct partial-refund steps from `pos-checkout.md` and shows `Source: pos-checkout.md`.
- [x] **AC2 Reset-password refusal.** Given the same setup, when I ask "how do I reset my POS password?", then the reply is the canned refusal that suggests contacting support, no steps are invented, and it has kind `refusal`.
- [x] **AC3 Refusal decided in code.** Given the top retrieval score is below the threshold, when `answer()` runs, then it returns a `refusal` without calling Ollama (proved by a unit test with a stub). Given Ollama replies exactly `NOT_IN_DOCS`, then `answer()` also returns a `refusal`.
- [x] **AC4 Scorecard.** Given the index is built and Ollama is running, when I run `npm test`, then it prints one scorecard with a percentage for retrieval, for faithfulness and for correct refusal. All three are computed deterministically (no LLM judge), and the run exits non-zero if any category is below its stated pass mark.
- [x] **AC5 SKIPPED, never fake.** Given Ollama is not running, or the index or model is missing, when I run `npm test`, then each category that could not run shows `SKIPPED` with a plain reason and no percentage, and no invented number appears. Categories that can run without the LLM (retrieval, and refusals decided by the threshold alone) still show real percentages.
- [x] **AC6 Local, keyless.** Given a machine with no API keys set and no `ANTHROPIC_*` or `VOYAGE_*` variables, when I ingest and chat, then embeddings run locally from `.cache/` after the first download and answers come from Ollama. A repo search finds no Anthropic, Voyage or other hosted-API SDK or URL.
- [x] **AC7 Local server hardening.** Given the server is running, then: it is bound to `127.0.0.1` and not `0.0.0.0`; a request whose `Host` header is not `127.0.0.1:PORT` or `localhost:PORT` gets 403; `POST /api/chat` requires `Content-Type: application/json` exactly and any `Origin` header present must equal the server's own origin (otherwise 403/415); no CORS headers are sent; a body over 10 KB returns 413 and the socket is cut while streaming, not after buffering; a question over about 500 characters returns 400 with a plain message; only one generation runs at a time and a second concurrent request gets 429; slow requests hit `headersTimeout`/`requestTimeout`; every URL other than `GET /` and `/index.html` returns 404 (no file path is ever built from the URL). Each rule has a unit test.
- [x] **AC8 No question text in logs.** Given I send a question containing a unique marker string, when I read the server output, then the marker never appears; only counts, scores and timings do.
- [x] **AC9 Chunker keeps steps together.** Given the three KB articles, when they are chunked, then every `##` section is its own chunk and no chunk ends in the middle of a numbered list (unit test over all three files plus a synthetic list-heavy fixture).
- [x] **AC10 Faithfulness checks.** Given a golden question, when the answer is scored, then it passes only if (1) it cites the expected source doc, (2) it contains that question's key phrases, and (3) every number, amount, time period and named option in it also appears in the retrieved chunks or in the question itself (compared by type: amount, time period, plain number). Given a deliberately wrong answer that invents a number, then check 3 fails (unit test on the scorer).
- [x] **AC11 Page safety.** Given the page is open, when a reply contains HTML such as `<img src=x onerror=alert(1)>`, then it appears as literal text. The page uses `textContent` and the code has no `innerHTML`. Given Ollama is stopped, when I send a question, then the page shows a plain error and does not hang.
- [x] **AC12 Fast tier for genesis.** Given no Ollama is running, when I run `npm run genesis -- verify`, then it runs typecheck, lint, `test:unit`, `eval:fast` and build only, makes no LLM call, and passes.
- [x] **AC13 Golden set discipline.** Given the golden set file, then it was written after the three docs; it has about 20 questions covering direct, paraphrased, near-miss unanswerable and about 5 held-out ones; and thresholds were calibrated on the non-held-out set and then reported on the held-out ones.
- [x] **AC14 README results and honesty.** Given the README, then it has a `## Results` scorecard pasted from a real run, states the honest limits (the faithfulness checks are a proxy, and about 20 questions give coarse percentages), and shows the Ollama setup steps.

- [x] **AC15 Local-only outbound calls, pinned model.** Given `OLLAMA_URL` is anything other than `http://localhost|127.0.0.1|[::1]` (parsed with `new URL()`, so `http://localhost.evil.com` and `http://127.0.0.1@evil.com` are rejected), when the app starts, then it fails with a plain message and sends nothing; the Ollama `fetch` uses `redirect: 'error'`, a 60 s `AbortController` timeout and a `num_predict` cap. Given the embedding model, then its exact revision (commit hash) is pinned in `src/config.ts`, the chat server never downloads anything (`allowRemoteModels` is false outside ingest/first run), and `@huggingface/transformers` is pinned to an exact version with `package-lock.json` committed.

## Tests
- `npm run test:unit` (no LLM, no network after the model cache exists): chunker, scorer, `answer()` with a stubbed retriever and stubbed generator, server limits (413, length cap, loopback bind).
- `npm run eval:fast` (no LLM): retrieval percentage from the real index plus threshold-only refusals. It prints SKIPPED for anything needing generation.
- `npm test` (full suite, needs Ollama): runs unit tests, then all three eval categories through the real `answer()` and prints the scorecard.
- `npm run genesis -- verify` (runs the `verify` script): typecheck + lint + `test:unit` + `eval:fast` + build. This is the loop's per-iteration gate.
- Also run manually and record the result: AC1 and AC2 in the browser, AC11 XSS string, and `npm audit` at the end.
- Re-run these at the end of every iteration to confirm each acceptance criterion still holds. Never check an AC off unexercised.

## Scope & no-gos
- In: `docs/kb/` (written by Juan), `src/` (`config.ts`, `types.ts`, `rag/`, `agent/`, `server/`, `evals/`, `index.ts`), `data/` (generated, git-ignored), `.cache/` (model cache, git-ignored), `src/evals/golden.json`, and the root-config files listed in the proposal, plus the `verify` script (D7).
- Out: login/auth, real POS actions, deploy, persistent history, real payments, multi-turn memory, any hosted service, any paid or keyed API (Claude, Anthropic, Voyage, OpenAI and so on), any SDK for Ollama (plain `fetch`), Express or any web framework, any real customer or employer content, a new database (the index is a JSON file), and design work beyond the text description.
- Production-safety guard stays on. Nothing here touches shared environments.
- Security rules for the build (from the security audit): no `child_process`/`exec` in `src/`; `verify`, `eval:fast` and `ingest` never build shell commands from question text or env values; the `verify` script never runs `npm audit fix` or installs anything and makes no network access; the `Source:` line comes from chunk metadata checked against the three known KB files, never from model text; the served page sends a Content-Security-Policy and `X-Content-Type-Options: nosniff`.

**Structure (from the architect, per the proposal):**
```
docs/kb/                pos-checkout.md, pos-renewals.md, gift-renewal-pos.md   (Juan writes)
src/config.ts           env-var config: Ollama URL and model, threshold, top-k, caps
src/types.ts            ChatResult = { kind:'answer'; text; source } | { kind:'refusal'; text }; Chunk; Golden types
src/index.ts            starts the server; checks Ollama and index, prints plain messages
src/rag/chunker.ts      split by ## heading, keep numbered lists whole
src/rag/embedder.ts     transformers.js wrapper, cache in .cache/
src/rag/store.ts        load/save data/index.json, cosine top-k
src/rag/ingest.ts       CLI: docs -> chunks -> embeddings -> data/index.json
src/agent/answer.ts     threshold + prompt + NOT_IN_DOCS -> ChatResult
src/agent/ollama.ts     fetch to Ollama /api/chat, temperature 0, fixed seed
src/server/server.ts    node:http on 127.0.0.1, POST /api/chat, caps, static page
src/server/index.html   one static page, textContent only
src/evals/golden.json   golden set
src/evals/score.ts      deterministic scorers (retrieval, faithfulness, refusal)
src/evals/run.ts        runs a tier, prints the scorecard
src/**/*.test.ts        unit tests (node:test via tsx)
```
The chosen test runner is Node's built-in `node:test` run through `tsx`, so no new dev dependency is needed.

## Appetite
About 10-12 supervised sessions, one per task group (roughly 3-4 focused days of work, excluding Juan's article writing). Check in after: the install spike (task 1), the golden set (task 4), the first end-to-end answer (task 8) and the first scorecard (task 10). Stop and check in if calibration (task 11) takes more than 3 attempts.

## Autonomy level
supervised   # supervised (checks in often) | autonomous (runs to appetite, stops only at breakpoints)

**Lane: A** — single system, small scope, all local; confirmed, not corrected. There is no new database, no new auth, no new cloud infrastructure, and no two systems talking for the first time. Ollama and the embedding model run on this machine and cost nothing. Infrastructure setting recorded: `none`. Design setting recorded: `none` (gate skipped per D5).

## Breakpoints — stop and pull in a human when:
- **Lane B:** a new database, new auth, new cloud infra, or two systems talking for the first time.
- A **destructive / irreversible / shared-environment** action.
- An acceptance criterion is **ambiguous or not testable**.
- An acceptance criterion **regressed** (was passing, now fails) or can't be verified this iteration.
- A test stays **red after 3 auto-fix attempts**.
- The **appetite / budget** is exceeded.
- Work would fall **outside the scope / no-gos** above.
- A **security, cost, or scalability** red flag (a secret is required, an unbounded query, paid infra).
- A **conflict between sources** (docs vs repo, or docs vs docs) — stop and ask, never resolve silently.
- **Ollama is not installed, not running, or the configured model (default `llama3.2:3b`) is not pulled** at a moment when a step needs it (the pull is about a 2 GB download; ask Juan to run it).
- **`onnxruntime-node` or `@huggingface/transformers` fails to install or run** on this Node/macOS (task 1), including the model download failing.
- **Golden-set or threshold calibration cannot reach acceptable results** (for example no threshold separates answerable questions from the near-miss traps). Do not quietly loosen the golden set or the pass marks; ask.
- **Any paid, keyed or hosted API creeps in** (a dependency, an env var or a URL for Claude, Anthropic, Voyage or similar).
- The KB articles are missing or too thin to write a fair golden set (task 3 is Juan's; the loop must not draft them).

Status: Ready
