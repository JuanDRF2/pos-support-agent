# Verify report — POS support chat agent with RAG and evals

Final pass, 2026-09-28. Every acceptance criterion of `loop-contract.md` was exercised again against the finished code; nothing was ticked from memory.

**Gates run at the end**
- `npm run genesis -- verify`: PASS (typecheck, lint, 103 unit tests, `eval:fast`, build), also with Ollama unreachable.
- `npm test`: exit code 0. 103 unit tests pass, 0 fail, 0 skipped. Full eval: retrieval 15/15, faithfulness 14/15, correct refusal 23/23; held-out 4/4, 3/4, 6/6; pass marks 90% / 85% / 95% all met.
- `npm audit`: 0 vulnerabilities.

| AC | How it was exercised | Result |
|---|---|---|
| AC1 partial refund | `src/agent/try.ts` in a clean environment, and the running app in Chrome and by HTTP | Answer with the steps, "5-7 business days" and `Source: pos-checkout.md` |
| AC2 reset password | Same three ways | Kind `refusal` with the support message, no steps |
| AC3 refusal in code | `answer.test.ts` (stub generator that fails if called; `NOT_IN_DOCS` in seven forms) | Pass |
| AC4 scorecard | `npm test` (three percentages, all deterministic); `report.test.ts` for the exit code below a mark | Exit 0 with marks met; exit 1 below a mark |
| AC5 SKIPPED, never fake | `run.ts --full` with `OLLAMA_URL` pointing at a port nobody listens on | Faithfulness `SKIPPED` with no number, refusal shown as threshold-only, `Result: NOT OK`, exit 1 |
| AC6 local, keyless | `env -i` shell (no variables at all): `npm run ingest`, then a question; grep of the code | Both worked; no Anthropic, Voyage or key names in `src`, `package.json`, `.env.example`; the only external host is `huggingface.co`, for the one-time model download (an exception written into the proposal) |
| AC7 local server hardening | `server.test.ts` (one test per rule); `lsof` on the real app; `curl` with a foreign Host, foreign Origin, `text/plain` and a 20 KB body | Bound to `127.0.0.1`; 403, 403, 415, 413; slow-drip cut; 429 for the second request; other URLs 404 |
| AC8 no question text in logs | Unit test with a marker (including failing pipelines); marker put in a real question to the running app | Logs hold only kind, error class and milliseconds; marker never appears |
| AC9 chunker | `chunker.test.ts` over the real articles, tiny size limits and a list-heavy fixture, plus a self-test that the detector can fail | Pass |
| AC10 faithfulness | `score.test.ts`: invented number, amount, weeks, code and option all fail; real text of every section passes | Pass |
| AC11 page safety | `page.test.ts`; Chrome with hostile text (`<img onerror>`, `<script>`, `javascript:` link) and a simulated Ollama-down error | Literal text, 0 injected elements, plain error, page did not hang |
| AC12 fast tier for genesis | `genesis verify` with Ollama unreachable | PASS, no LLM call |
| AC13 golden set | `golden.test.ts` and the timeline in `planning/decisions.md` | Written after the articles; 23 questions (8 direct, 7 paraphrase, 6 trap, 2 injection), 6 held out; each answerable question names its section, validated against the real headings; threshold and prompt tuned on the non-held-out set |
| AC14 README | `README.md` | Setup steps, honest limits and a `## Results` block pasted from a real run |
| AC15 local-only calls, pinned model | Startup with four non-local `OLLAMA_URL` values; grep of the code | All four refused with plain messages, nothing started; `redirect: 'error'`, 60 s timeout and a 400-token cap present; model revision, file hashes, exact `@huggingface/transformers` 4.3.0 and `package-lock.json` in place; the app loads the model with remote models off |

**Known limits (also in the README)**
- Faithfulness is a proxy and does not measure completeness beyond key phrases. The one failing question is `g14` (missing "general support").
- 23 questions from three short articles by the same author: the numbers are a demonstration, not a general accuracy claim. Overfitting risks are listed in `planning/decisions.md` (task 11 entry).
- Reproducibility was checked only on one 8 GB Mac with a fixed seed.

**Deviations from the approved proposal, all recorded where they were decided**
- Embeddings load from a hash-verified local folder (the library's own cache is not re-read for a pinned revision).
- `verify` script (D7); `.genesis/**` ignored in `eslint.config.js`; exact dependency version; stricter `OLLAMA_URL` validation.
- Default model `llama3.2:3b` instead of a 7-8B model, after measuring the 7-8B as too slow on 8 GB (D4).
- Faithfulness compares amounts, time periods and numbers by type, and counts what the merchant wrote as known.
- Retrieval is scored by section, not by article.
