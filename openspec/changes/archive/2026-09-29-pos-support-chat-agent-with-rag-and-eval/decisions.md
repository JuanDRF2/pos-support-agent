# Decisions — pos-support-chat-agent-with-rag-and-eval

Append-only, written by `genesis decide` / `genesis reconcile` (a hook blocks hand-edits).
Each record marks its affected artifacts stale in `state.yaml` until reconciled.

## DEC-pos-support-chat-agent-with-rag-and-eval-01 — 2026-10-01
- What: Switch default generation model from llama3.1:8b to llama3.2:3b after measuring on 8 GB RAM
- Affects: (none)
- Why: The 8B model took 51 s to load and 13.4 s to generate 2 tokens, which would blow the 60 s Ollama timeout so no real answer could work. The 3B loaded in about 7 s and generated at about 25 tokens/s. It was a measured performance failure, not a preference.
- Rejected: llama3.1:8b (7-8B Q4): too slow on 8 GB of RAM, 51 s load and about 6-7 s per token, cannot fit the 60 s timeout
- Rejected: Intermediate model (Phi-3.5-mini or newer Llama 3.2) before the 3B: Juan went straight to llama3.2:3b after measuring, an explicit decision
- Evidence: src/config.ts, .env.example

## DEC-pos-support-chat-agent-with-rag-and-eval-02 — 2026-10-01
- What: Refusal is decided in code in two layers: a retrieval score threshold (no model call) plus a NOT_IN_DOCS signal from the model
- Affects: (none)
- Why: A small local model invents things easily. Deciding in code makes refusal deterministic and testable, and the threshold is a second layer under the prompt. Measured: the threshold alone refuses only 2 of 8 must-refuse questions; the other 6 were refused by the model's NOT_IN_DOCS, so both layers are kept.
- Rejected: Refusal left to the LLM: small local models invent easily
- Evidence: src/agent/answer.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-03 — 2026-10-01
- What: Fully local stack: transformers.js embeddings (Xenova/all-MiniLM-L6-v2) and Ollama generation, no hosted API
- Affects: (none)
- Why: Free, offline after setup, and anyone can clone it and run the evals without an account or API key. The author has no API access on their plan.
- Rejected: Voyage AI for embeddings: needs a key and cost
- Rejected: Claude for generation: no API access, project must be local and free
- Rejected: Claude as LLM-as-judge: no API access
- Evidence: src/rag/embedder.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-04 — 2026-10-01
- What: Deterministic evals (retrieval, faithfulness, correct refusal) instead of an LLM judge
- Affects: (none)
- Why: No key, no cost, repeatable. The price is that faithfulness checks are a proxy for meaning: they catch missing or invented specifics but not a fluent, subtly wrong sentence.
- Rejected: Claude as LLM-as-judge for faithfulness: no API access on the plan
- Evidence: src/evals/score.ts, src/evals/report.ts, src/evals/run.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-05 — 2026-10-01
- What: Search index stored as a single JSON file (data/index.json) held in memory, with cosine top-k, validated on load
- Affects: (none)
- Why: Simple local storage for a demo with 10 chunks. The store validates model, revision, 384 dimensions, known sources and finite numbers, and any mismatch tells the user to run npm run ingest.
- Breaks at: A JSON file with 10 chunks works for a demo; thousands of articles need an actual vector database, and retrieval tuning becomes its own project at that size.
- Evidence: src/rag/store.ts, src/rag/ingest.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-06 — 2026-10-01
- What: Chunk by `##` section, keeping numbered lists whole and splitting only above 1,500 characters between blocks
- Affects: (none)
- Why: Steps of a procedure such as the partial refund must never get separated, and not indexing the title/intro gives a cleaner retrieval surface with less noise.
- Rejected: Indexing the title and intro before the first ## : they only add retrieval noise
- Evidence: src/rag/chunker.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-07 — 2026-10-01
- What: System prompt changed from "concisely" to "answer completely" (V2)
- Affects: (none)
- Why: The model stopped on its own after 55 tokens, not due to the token cap. On 17 tuning questions, V2 raised recall of the article's numbers from 0.36 to 0.86 with 0 invented numbers and 6 of 6 traps refused.
- Rejected: V0 "concisely": recall 0.36, dropped time periods
- Rejected: V1 "every step, then any timing or condition": recall 0.55, 1 false refusal and 1 invented number
- Rejected: Further tuning: stopped on purpose, more iterations against 17 questions would overfit
- Evidence: src/agent/answer.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-08 — 2026-10-01
- What: Refusal threshold set to 0.30 with pass marks 90% / 85% / 95%
- Affects: (none)
- Why: Every value 0 to 0.40 gave the same end-to-end result and 0.45 refuses a legitimate paraphrase (top score 0.42). 0.30 keeps a 0.12 margin from the lowest answerable score while still refusing clearly off-topic questions before the model. Pass marks allow one question of slack each as regression alarms.
- Rejected: 0.35 provisional: margin only 0.07
- Rejected: 0.40: margin only 0.02
- Rejected: 0.45: refuses legitimate paraphrase g09
- Breaks at: The data cannot tell values inside the plateau apart, so it is a judgement about margin, not a measured optimum; the 0.42 bound comes from a single question.
- Evidence: src/config.ts, src/evals/passmarks.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-09 — 2026-10-01
- What: Retrieval scored by section (article plus heading in top 3) instead of by article
- Affects: (none)
- Why: The index has only 10 chunks and 3 articles, so top 3 cover 30% of it and article-level scoring is too easy; each answerable question lists its answering section headings (sourceHeadings).
- Rejected: Article-level retrieval scoring: too easy with 10 chunks and 3 articles
- Evidence: src/evals/golden.json, src/evals/score.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-10 — 2026-10-01
- What: Golden set written after the docs, with paraphrases, near-miss traps, injections and held-out questions
- Affects: (none)
- Why: Avoid golden-set circularity (questions derived from docs can be too easy) and overfitting of the threshold/prompt: 6 of 23 questions are held out and reported separately.
- Breaks at: With 23 questions one question moves a percentage by about 4 points (25 for a held-out one), and the author wrote both articles and questions, so a clean score says little about general accuracy.
- Evidence: src/evals/golden.json, src/evals/golden.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-11 — 2026-10-01
- What: Prompt-injection mitigations: delimiter neutralisation, separate sections, source taken from metadata, capped replies
- Affects: (none)
- Why: The chat model has no tools so the worst case is a wrong or refused answer; runs of three or more < or > are neutralised so prompt delimiters cannot be forged, and the Source line comes from chunk metadata, never model text.
- Evidence: src/agent/answer.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-12 — 2026-10-01
- What: Treat any reply containing NOT_IN_DOCS anywhere as a refusal (token strict, position not)
- Affects: (none)
- Why: Showing a possibly-wrong answer is worse than an extra refusal, and a small model often adds words around the sentinel.
- Rejected: Exact full-reply match of NOT_IN_DOCS: small models add words around it
- Evidence: src/agent/answer.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-13 — 2026-10-01
- What: Faithfulness scorer compares numbers by type and counts the question's own numbers as known
- Affects: (none)
- Why: Bare-number checking let an invented "$5.00" pass because "5" appears in "5-7 business days"; and the model repeating the merchant's own "six weeks ago" was wrongly flagged. Both were fixed without touching the golden set or pass marks.
- Rejected: Comparing bare numbers: lets invented amounts pass
- Evidence: src/evals/score.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-14 — 2026-10-01
- What: Golden set of 23 questions written from the three articles after they were fixed, with 6 held-out questions, and its closeness to the source stated as a limit
- Affects: (none)
- Supersedes: DEC-pos-support-chat-agent-with-rag-and-eval-10
- Why: The questions came from the same three short articles the model reads, with paraphrases, near-miss traps, injections and 6 held-out questions not used to tune the prompt or threshold. Because the author wrote both the articles and the questions, a clean score says little about other wording; the held-out ones have been looked at several times so they are only weakly independent.
- Breaks at: With 23 questions one question moves a percentage by 4 points (25 for a held-out one), so the numbers are a demonstration, not a general accuracy claim.
- Evidence: src/evals/golden.json, src/evals/golden.ts, README.md

## DEC-pos-support-chat-agent-with-rag-and-eval-15 — 2026-10-01
- What: Fully local and free stack: transformers.js embeddings (Xenova/all-MiniLM-L6-v2) and Ollama generation, no hosted API
- Affects: (none)
- Supersedes: DEC-pos-support-chat-agent-with-rag-and-eval-03
- Why: The project had to be free and 100% local: no key and no cost, offline after setup, and anyone can clone it and run the evals without an account.
- Rejected: Voyage AI for embeddings: needs a key and has a cost
- Rejected: Claude for generation: a hosted API needs a key and has a cost, and the project must be local and free
- Rejected: Claude as LLM-as-judge: same reason, key and cost
- Evidence: src/rag/embedder.ts, src/agent/ollama.ts

## DEC-pos-support-chat-agent-with-rag-and-eval-16 — 2026-10-01
- What: Deterministic evals (retrieval, faithfulness, correct refusal) instead of an LLM judge
- Affects: (none)
- Supersedes: DEC-pos-support-chat-agent-with-rag-and-eval-04
- Why: No key, no cost, repeatable. The price is that faithfulness checks are a proxy for meaning: they catch missing or invented specifics but not a fluent, subtly wrong sentence.
- Rejected: Claude as LLM-as-judge for faithfulness: needs a key and has a cost, and the project must be local and free
- Evidence: src/evals/score.ts, src/evals/report.ts, src/evals/run.ts

