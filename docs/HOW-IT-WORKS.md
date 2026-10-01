<!-- GENERATED from the decision ledger by `genesis how-it-works`. Do not edit by hand. -->
<!-- ledger-digest: ed3fb8e05e66c4d1 -->

# How pos-support-agent works

## 1. En 60 segundos

| Decisión | Alternativa descartada y por qué | Fuente |
|---|---|---|
| Switch default generation model from llama3.1:8b to llama3.2:3b after measuring on 8 GB RAM | llama3.1:8b (7-8B Q4): too slow on 8 GB of RAM, 51 s load and about 6-7 s per token, cannot fit the 60 s timeout; Intermediate model (Phi-3.5-mini or newer Llama 3.2) before the 3B: Juan went straight to llama3.2:3b after measuring, an explicit decision | `src/config.ts`, `.env.example` |
| Refusal is decided in code in two layers: a retrieval score threshold (no model call) plus a NOT_IN_DOCS signal from the model | Refusal left to the LLM: small local models invent easily | `src/agent/answer.ts` |
| Fully local stack: transformers.js embeddings (Xenova/all-MiniLM-L6-v2) and Ollama generation, no hosted API | Voyage AI for embeddings: needs a key and cost; Claude for generation: no API access, project must be local and free; Claude as LLM-as-judge: no API access | `src/rag/embedder.ts` |
| Deterministic evals (retrieval, faithfulness, correct refusal) instead of an LLM judge | Claude as LLM-as-judge for faithfulness: no API access on the plan | `src/evals/score.ts`, `src/evals/report.ts`, `src/evals/run.ts` |
| Search index stored as a single JSON file (data/index.json) held in memory, with cosine top-k, validated on load | no hay decisión escrita | `src/rag/store.ts`, `src/rag/ingest.ts` |
| Chunk by `##` section, keeping numbered lists whole and splitting only above 1,500 characters between blocks | Indexing the title and intro before the first ## : they only add retrieval noise | `src/rag/chunker.ts` |
| System prompt changed from "concisely" to "answer completely" (V2) | V0 "concisely": recall 0.36, dropped time periods; V1 "every step, then any timing or condition": recall 0.55, 1 false refusal and 1 invented number; Further tuning: stopped on purpose, more iterations against 17 questions would overfit | `src/agent/answer.ts` |
| Refusal threshold set to 0.30 with pass marks 90% / 85% / 95% | 0.35 provisional: margin only 0.07; 0.40: margin only 0.02; 0.45: refuses legitimate paraphrase g09 | `src/config.ts`, `src/evals/passmarks.ts` |
| Retrieval scored by section (article plus heading in top 3) instead of by article | Article-level retrieval scoring: too easy with 10 chunks and 3 articles | `src/evals/golden.json`, `src/evals/score.ts` |
| Golden set written after the docs, with paraphrases, near-miss traps, injections and held-out questions (reemplazada por DEC-pos-support-chat-agent-with-rag-and-eval-14) | no hay decisión escrita | `src/evals/golden.json`, `src/evals/golden.ts` |
| Prompt-injection mitigations: delimiter neutralisation, separate sections, source taken from metadata, capped replies | no hay decisión escrita | `src/agent/answer.ts` |
| Treat any reply containing NOT_IN_DOCS anywhere as a refusal (token strict, position not) | Exact full-reply match of NOT_IN_DOCS: small models add words around it | `src/agent/answer.ts` |
| Faithfulness scorer compares numbers by type and counts the question's own numbers as known | Comparing bare numbers: lets invented amounts pass | `src/evals/score.ts` |
| Golden set of 23 questions written from the three articles after they were fixed, with 6 held-out questions, and its closeness to the source stated as a limit | no hay decisión escrita | `src/evals/golden.json`, `src/evals/golden.ts`, `README.md` |

## 2. Decisiones clave

### DEC-pos-support-chat-agent-with-rag-and-eval-01 — Switch default generation model from llama3.1:8b to llama3.2:3b after measuring on 8 GB RAM
> **En palabras simples:** Switched the default generation model to llama3.2:3b because the 8B model couldn't meet the 60-second Ollama timeout (51 s load time, 6-7 s/token generation). The 3B loaded in 7 s and generated at 25 tokens/s, meeting the constraint.
- **Por qué:** The 8B model took 51 s to load and 13.4 s to generate 2 tokens, which would blow the 60 s Ollama timeout so no real answer could work. The 3B loaded in about 7 s and generated at about 25 tokens/s. It was a measured performance failure, not a preference.
- **Alternativas descartadas:** llama3.1:8b (7-8B Q4): too slow on 8 GB of RAM, 51 s load and about 6-7 s per token, cannot fit the 60 s timeout; Intermediate model (Phi-3.5-mini or newer Llama 3.2) before the 3B: Juan went straight to llama3.2:3b after measuring, an explicit decision
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/config.ts`, `.env.example`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-02 — Refusal is decided in code in two layers: a retrieval score threshold (no model call) plus a NOT_IN_DOCS signal from the model
> **En palabras simples:** Refusal is handled in two layers: a retrieval score threshold (bypassing the model) and a NOT_IN_DOCS signal from the model. This makes refusal deterministic and testable, compensating for the local model's tendency to hallucinate when documents don't support an answer.
- **Por qué:** A small local model invents things easily. Deciding in code makes refusal deterministic and testable, and the threshold is a second layer under the prompt. Measured: the threshold alone refuses only 2 of 8 must-refuse questions; the other 6 were refused by the model's NOT_IN_DOCS, so both layers are kept.
- **Alternativas descartadas:** Refusal left to the LLM: small local models invent easily
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/agent/answer.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-03 — Fully local stack: transformers.js embeddings (Xenova/all-MiniLM-L6-v2) and Ollama generation, no hosted API
> **En palabras simples:** Built with transformers.js (a library for creating embeddings—numerical text representations) and Ollama (a local LLM for text generation), enabling a fully offline, free stack where anyone can clone and run evaluations without API keys.
- **Por qué:** Free, offline after setup, and anyone can clone it and run the evals without an account or API key. The author has no API access on their plan.
- **Alternativas descartadas:** Voyage AI for embeddings: needs a key and cost; Claude for generation: no API access, project must be local and free; Claude as LLM-as-judge: no API access
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/rag/embedder.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-04 — Deterministic evals (retrieval, faithfulness, correct refusal) instead of an LLM judge
> **En palabras simples:** Selected deterministic evaluations for retrieval, faithfulness, and refusal checks over an LLM judge, eliminating API key and cost requirements while ensuring repeatable results.
- **Por qué:** No key, no cost, repeatable. The price is that faithfulness checks are a proxy for meaning: they catch missing or invented specifics but not a fluent, subtly wrong sentence.
- **Alternativas descartadas:** Claude as LLM-as-judge for faithfulness: no API access on the plan
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/evals/score.ts`, `src/evals/report.ts`, `src/evals/run.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-05 — Search index stored as a single JSON file (data/index.json) held in memory, with cosine top-k, validated on load
> **En palabras simples:** Stored the search index as a single JSON file in memory with cosine similarity top-k retrieval because it's simple for a demo with 10 chunks; validation on load checks model, revision, 384 dimensions, and sources, prompting reimport if mismatched.
- **Por qué:** Simple local storage for a demo with 10 chunks. The store validates model, revision, 384 dimensions, known sources and finite numbers, and any mismatch tells the user to run npm run ingest.
- **Alternativas descartadas:** no hay decisión escrita
- **Qué se rompe primero al escalar:** A JSON file with 10 chunks works for a demo; thousands of articles need an actual vector database, and retrieval tuning becomes its own project at that size.
- **Fuente:** `src/rag/store.ts`, `src/rag/ingest.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-06 — Chunk by `##` section, keeping numbered lists whole and splitting only above 1,500 characters between blocks
> **En palabras simples:** Documents are chunked by markdown sections (##) with a 1,500 character limit, keeping numbered lists intact. Title and intro text are excluded from the search index to reduce retrieval noise and ensure procedural steps never split across chunks.
- **Por qué:** Steps of a procedure such as the partial refund must never get separated, and not indexing the title/intro gives a cleaner retrieval surface with less noise.
- **Alternativas descartadas:** Indexing the title and intro before the first ## : they only add retrieval noise
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/rag/chunker.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-07 — System prompt changed from "concisely" to "answer completely" (V2)
> **En palabras simples:** Changed the system prompt from "concisely" to "answer completely" (V2), raising recall from 0.36 to 0.86 on evaluation questions while achieving zero hallucinated numbers and correctly refusing all traps. Stopped tuning there to avoid overfitting the 17-question test set.
- **Por qué:** The model stopped on its own after 55 tokens, not due to the token cap. On 17 tuning questions, V2 raised recall of the article's numbers from 0.36 to 0.86 with 0 invented numbers and 6 of 6 traps refused.
- **Alternativas descartadas:** V0 "concisely": recall 0.36, dropped time periods; V1 "every step, then any timing or condition": recall 0.55, 1 false refusal and 1 invented number; Further tuning: stopped on purpose, more iterations against 17 questions would overfit
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/agent/answer.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-08 — Refusal threshold set to 0.30 with pass marks 90% / 85% / 95%
> **En palabras simples:** A refusal threshold of 0.30 filters low-confidence questions before model inference, chosen to maintain a 0.12 safety margin below the lowest valid score (0.42) while matching accuracy of higher thresholds; pass marks (90%/85%/95%) detect regressions.
- **Por qué:** Every value 0 to 0.40 gave the same end-to-end result and 0.45 refuses a legitimate paraphrase (top score 0.42). 0.30 keeps a 0.12 margin from the lowest answerable score while still refusing clearly off-topic questions before the model. Pass marks allow one question of slack each as regression alarms.
- **Alternativas descartadas:** 0.35 provisional: margin only 0.07; 0.40: margin only 0.02; 0.45: refuses legitimate paraphrase g09
- **Qué se rompe primero al escalar:** The data cannot tell values inside the plateau apart, so it is a judgement about margin, not a measured optimum; the 0.42 bound comes from a single question.
- **Fuente:** `src/config.ts`, `src/evals/passmarks.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-09 — Retrieval scored by section (article plus heading in top 3) instead of by article
> **En palabras simples:** Retrieval was scored by section (article + heading) instead of article alone because with only 3 articles and 10 chunks, top 3 results cover 30% of the index, making article-level scoring too coarse for evaluation.
- **Por qué:** The index has only 10 chunks and 3 articles, so top 3 cover 30% of it and article-level scoring is too easy; each answerable question lists its answering section headings (sourceHeadings).
- **Alternativas descartadas:** Article-level retrieval scoring: too easy with 10 chunks and 3 articles
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/evals/golden.json`, `src/evals/score.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-10 — Golden set written after the docs, with paraphrases, near-miss traps, injections and held-out questions (reemplazada por DEC-pos-support-chat-agent-with-rag-and-eval-14)
- **Por qué:** Avoid golden-set circularity (questions derived from docs can be too easy) and overfitting of the threshold/prompt: 6 of 23 questions are held out and reported separately.
- **Alternativas descartadas:** no hay decisión escrita
- **Qué se rompe primero al escalar:** With 23 questions one question moves a percentage by about 4 points (25 for a held-out one), and the author wrote both articles and questions, so a clean score says little about general accuracy.
- **Fuente:** `src/evals/golden.json`, `src/evals/golden.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-11 — Prompt-injection mitigations: delimiter neutralisation, separate sections, source taken from metadata, capped replies
> **En palabras simples:** Implemented prompt-injection mitigations: delimiter neutralisation prevents forgery of < or >, separate sections isolate user input, and the source attribution always comes from chunk metadata. Since the chat model has no tools, wrong or refused answers are the worst case, not API compromise.
- **Por qué:** The chat model has no tools so the worst case is a wrong or refused answer; runs of three or more < or > are neutralised so prompt delimiters cannot be forged, and the Source line comes from chunk metadata, never model text.
- **Alternativas descartadas:** no hay decisión escrita
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/agent/answer.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-12 — Treat any reply containing NOT_IN_DOCS anywhere as a refusal (token strict, position not)
> **En palabras simples:** Chose token-level detection of NOT_IN_DOCS sentinel anywhere in a response to refuse uncertain answers from a RAG-based chat agent. This is more robust than exact full-reply matching because small language models often insert words around the sentinel.
- **Por qué:** Showing a possibly-wrong answer is worse than an extra refusal, and a small model often adds words around the sentinel.
- **Alternativas descartadas:** Exact full-reply match of NOT_IN_DOCS: small models add words around it
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/agent/answer.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-13 — Faithfulness scorer compares numbers by type and counts the question's own numbers as known
> **En palabras simples:** The faithfulness scorer now compares numbers by type and treats source-question numbers as known context, fixing false positives from coincidental matches and false negatives from correct model data repetition.
- **Por qué:** Bare-number checking let an invented "$5.00" pass because "5" appears in "5-7 business days"; and the model repeating the merchant's own "six weeks ago" was wrongly flagged. Both were fixed without touching the golden set or pass marks.
- **Alternativas descartadas:** Comparing bare numbers: lets invented amounts pass
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/evals/score.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-14 — Golden set of 23 questions written from the three articles after they were fixed, with 6 held-out questions, and its closeness to the source stated as a limit
> **En palabras simples:** Built a 23-question evaluation set from the same articles the model reads, with 6 held-out questions, but noted the author created both materials, so accuracy only demonstrates performance on this specific content.
- **Por qué:** The questions came from the same three short articles the model reads, with paraphrases, near-miss traps, injections and 6 held-out questions not used to tune the prompt or threshold. Because the author wrote both the articles and the questions, a clean score says little about other wording; the held-out ones have been looked at several times so they are only weakly independent.
- **Alternativas descartadas:** no hay decisión escrita
- **Qué se rompe primero al escalar:** With 23 questions one question moves a percentage by 4 points (25 for a held-out one), so the numbers are a demonstration, not a general accuracy claim.
- **Fuente:** `src/evals/golden.json`, `src/evals/golden.ts`, `README.md`
- **Registrada:** 2026-10-01

## 3. Preguntas de entrevista (10 de 10 posibles)

1. **At what point would you need to switch from a JSON file to an actual vector database, and what becomes a problem as your system scales?**
   - Hechos obligatorios: JSON file works for 10 chunks in a demo; thousands of articles need an actual vector database; retrieval tuning becomes its own project at large scale
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-05 (`src/rag/store.ts`, `src/rag/ingest.ts`)
2. **You rejected 0.40 and 0.35 in favor of 0.30. Why is the extra 0.07–0.10 margin necessary when values 0–0.40 all produced the same end-to-end accuracy?**
   - Hechos obligatorios: 0.30 chosen with 0.12 margin; Rejected 0.40 (margin 0.02) and 0.35 (margin 0.07); Every value 0 to 0.40 gave the same end-to-end result; The data cannot tell values inside the plateau apart; it's a judgment about margin, not a measured optimum; The 0.42 bound comes from a single question
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-08 (`src/config.ts`, `src/evals/passmarks.ts`)
3. **You have 23 questions in your evaluation set. How sensitive is your accuracy metric to individual questions, and why does that matter?**
   - Hechos obligatorios: With 23 questions, each question changes accuracy by approximately 4 percentage points; With held-out questions, each changes accuracy by approximately 25 percentage points; High sensitivity per question means the sample size is too small to be reliable; Numbers are demonstration of performance on this specific content, not general accuracy claims
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-14 (`src/evals/golden.json`, `src/evals/golden.ts`, `README.md`)
4. **The 8B model took 51 seconds to load and 6-7 seconds per token, well over your 60-second timeout constraint. Why did you choose to downgrade the model rather than optimize the timeout or the infrastructure?**
   - Hechos obligatorios: 51 s load; 6-7 s per token; 60 s Ollama timeout; measured performance failure
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-01 (`src/config.ts`, `.env.example`)
5. **Why add a retrieval threshold instead of letting the model refuse answers on its own?**
   - Hechos obligatorios: small local models invent/hallucinate easily; two-layer approach: threshold plus NOT_IN_DOCS signal; makes refusal deterministic and testable; measured data: threshold alone refused only 2 of 8 must-refuse cases, model's NOT_IN_DOCS signal refused the other 6
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-02 (`src/agent/answer.ts`)
6. **You rejected Voyage AI for embeddings and Claude for both generation and evaluation. What made a fully local approach necessary rather than a hosted alternative?**
   - Hechos obligatorios: Author has no API access on their plan; Voyage AI requires API keys and costs money; Claude requires API access; Free and offline after setup enables anyone to clone and run
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-03 (`src/rag/embedder.ts`)
7. **Why did you choose deterministic checks over an LLM judge despite their potential limitations?**
   - Hechos obligatorios: no API access on the plan
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-04 (`src/evals/score.ts`, `src/evals/report.ts`, `src/evals/run.ts`)
8. **You chose not to index the title and intro text before the first ##. What specific problem would occur if you included them?**
   - Hechos obligatorios: retrieval noise; cleaner retrieval surface; title and intro
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-06 (`src/rag/chunker.ts`)
9. **Why did you move to 'answer completely' instead of sticking with more concise prompt versions?**
   - Hechos obligatorios: V0 'concisely' had recall 0.36 and dropped time periods; V1 had recall 0.55, 1 false refusal, and 1 invented number; V2 'answer completely' achieved recall 0.86 with 0 invented numbers and 6 of 6 traps refused
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-07 (`src/agent/answer.ts`)
10. **Why was article-level retrieval scoring insufficient for this evaluation, and how does your dataset size affect that decision?**
   - Hechos obligatorios: 3 articles; 10 chunks; top 3 results cover 30%; article-level scoring too easy
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-09 (`src/evals/golden.json`, `src/evals/score.ts`)
