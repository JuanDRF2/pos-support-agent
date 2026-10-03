<!-- GENERATED from the decision ledger by `genesis how-it-works`. Do not edit by hand. -->
<!-- ledger-digest: 0ca92ffba5b78925 -->

# How pos-support-agent works

## 1. En 60 segundos

| Decisión | Alternativa descartada y por qué | Fuente |
|---|---|---|
| Switch default generation model from llama3.1:8b to llama3.2:3b after measuring on 8 GB RAM | llama3.1:8b (7-8B Q4): too slow on 8 GB of RAM, 51 s load and about 6-7 s per token, cannot fit the 60 s timeout; Intermediate model (Phi-3.5-mini or newer Llama 3.2) before the 3B: Juan went straight to llama3.2:3b after measuring, an explicit decision | `src/config.ts`, `.env.example` |
| Refusal is decided in code in two layers: a retrieval score threshold (no model call) plus a NOT_IN_DOCS signal from the model | Refusal left to the LLM: small local models invent easily | `src/agent/answer.ts` |
| Search index stored as a single JSON file (data/index.json) held in memory, with cosine top-k, validated on load | no hay decisión escrita | `src/rag/store.ts`, `src/rag/ingest.ts` |
| Chunk by `##` section, keeping numbered lists whole and splitting only above 1,500 characters between blocks | Indexing the title and intro before the first ## : they only add retrieval noise | `src/rag/chunker.ts` |
| System prompt changed from "concisely" to "answer completely" (V2) | V0 "concisely": recall 0.36, dropped time periods; V1 "every step, then any timing or condition": recall 0.55, 1 false refusal and 1 invented number; Further tuning: stopped on purpose, more iterations against 17 questions would overfit | `src/agent/answer.ts` |
| Refusal threshold set to 0.30 with pass marks 90% / 85% / 95% | 0.35 provisional: margin only 0.07; 0.40: margin only 0.02; 0.45: refuses legitimate paraphrase g09 | `src/config.ts`, `src/evals/passmarks.ts` |
| Retrieval scored by section (article plus heading in top 3) instead of by article | Article-level retrieval scoring: too easy with 10 chunks and 3 articles | `src/evals/golden.json`, `src/evals/score.ts` |
| Prompt-injection mitigations: delimiter neutralisation, separate sections, source taken from metadata, capped replies | no hay decisión escrita | `src/agent/answer.ts` |
| Treat any reply containing NOT_IN_DOCS anywhere as a refusal (token strict, position not) | Exact full-reply match of NOT_IN_DOCS: small models add words around it | `src/agent/answer.ts` |
| Faithfulness scorer compares numbers by type and counts the question's own numbers as known | Comparing bare numbers: lets invented amounts pass | `src/evals/score.ts` |
| Golden set of 23 questions written from the three articles after they were fixed, with 6 held-out questions, and its closeness to the source stated as a limit | no hay decisión escrita | `src/evals/golden.json`, `src/evals/golden.ts`, `README.md` |
| Fully local and free stack: transformers.js embeddings (Xenova/all-MiniLM-L6-v2) and Ollama generation, no hosted API | Voyage AI for embeddings: needs a key and has a cost; Claude for generation: a hosted API needs a key and has a cost, and the project must be local and free; Claude as LLM-as-judge: same reason, key and cost | `src/rag/embedder.ts`, `src/agent/ollama.ts` |
| Deterministic evals (retrieval, faithfulness, correct refusal) instead of an LLM judge | Claude as LLM-as-judge for faithfulness: needs a key and has a cost, and the project must be local and free | `src/evals/score.ts`, `src/evals/report.ts`, `src/evals/run.ts` |

## 2. Decisiones clave

### DEC-pos-support-chat-agent-with-rag-and-eval-01 — Switch default generation model from llama3.1:8b to llama3.2:3b after measuring on 8 GB RAM
> **En palabras simples:** Se cambió de llama3.1:8b a llama3.2:3b porque el modelo grande era demasiado lento (51 s de carga, 6-7 tokens/s) y excedía el timeout de 60 s de Ollama. El modelo pequeño cargaba en 7 s y generaba 25 tokens/s, permitiendo respuestas reales en tiempo.
- **Por qué:** The 8B model took 51 s to load and 13.4 s to generate 2 tokens, which would blow the 60 s Ollama timeout so no real answer could work. The 3B loaded in about 7 s and generated at about 25 tokens/s. It was a measured performance failure, not a preference.
- **Alternativas descartadas:** llama3.1:8b (7-8B Q4): too slow on 8 GB of RAM, 51 s load and about 6-7 s per token, cannot fit the 60 s timeout; Intermediate model (Phi-3.5-mini or newer Llama 3.2) before the 3B: Juan went straight to llama3.2:3b after measuring, an explicit decision
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/config.ts`, `.env.example`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-02 — Refusal is decided in code in two layers: a retrieval score threshold (no model call) plus a NOT_IN_DOCS signal from the model
> **En palabras simples:** Se implementó rechazo en dos capas: un umbral de puntuación de recuperación sin llamar al modelo, más una señal NOT_IN_DOCS del modelo. Esto hace el rechazo determinista y testeable, evitando que el modelo local invente respuestas.
- **Por qué:** A small local model invents things easily. Deciding in code makes refusal deterministic and testable, and the threshold is a second layer under the prompt. Measured: the threshold alone refuses only 2 of 8 must-refuse questions; the other 6 were refused by the model's NOT_IN_DOCS, so both layers are kept.
- **Alternativas descartadas:** Refusal left to the LLM: small local models invent easily
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/agent/answer.ts`
- **Registrada:** 2026-10-01

> 🔎 **Punto de control 1.** Antes de seguir, responde con tus palabras: `npm run genesis -- check 1 "<tu respuesta>"` (primero `npm run genesis -- check` te muestra la pregunta).

### DEC-pos-support-chat-agent-with-rag-and-eval-03 — Fully local stack: transformers.js embeddings (Xenova/all-MiniLM-L6-v2) and Ollama generation, no hosted API (reemplazada por DEC-pos-support-chat-agent-with-rag-and-eval-15)

### DEC-pos-support-chat-agent-with-rag-and-eval-04 — Deterministic evals (retrieval, faithfulness, correct refusal) instead of an LLM judge (reemplazada por DEC-pos-support-chat-agent-with-rag-and-eval-16)

### DEC-pos-support-chat-agent-with-rag-and-eval-05 — Search index stored as a single JSON file (data/index.json) held in memory, with cosine top-k, validated on load
> **En palabras simples:** Se almacena el índice en un archivo JSON validado para la demo con 10 fragmentos. Escalar a miles de artículos requiere una vector database (base de datos de vectores).
- **Por qué:** Simple local storage for a demo with 10 chunks. The store validates model, revision, 384 dimensions, known sources and finite numbers, and any mismatch tells the user to run npm run ingest.
- **Alternativas descartadas:** no hay decisión escrita
- **Qué se rompe primero al escalar:** A JSON file with 10 chunks works for a demo; thousands of articles need an actual vector database, and retrieval tuning becomes its own project at that size.
- **Fuente:** `src/rag/store.ts`, `src/rag/ingest.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-06 — Chunk by `##` section, keeping numbered lists whole and splitting only above 1,500 characters between blocks
> **En palabras simples:** Se dividió el contenido por secciones ## manteniendo listas numeradas intactas y fragmentando sobre 1,500 caracteres. Esto evita romper procedimientos y reduce ruido en búsquedas al excluir títulos e introducciones del índice.
- **Por qué:** Steps of a procedure such as the partial refund must never get separated, and not indexing the title/intro gives a cleaner retrieval surface with less noise.
- **Alternativas descartadas:** Indexing the title and intro before the first ## : they only add retrieval noise
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/rag/chunker.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-07 — System prompt changed from "concisely" to "answer completely" (V2)
> **En palabras simples:** Se cambió el prompt del sistema de «concisamente» a «responder completamente» para mejorar el recall (proporción de información correcta recuperada) del 36% al 86% sin inventar números.
- **Por qué:** The model stopped on its own after 55 tokens, not due to the token cap. On 17 tuning questions, V2 raised recall of the article's numbers from 0.36 to 0.86 with 0 invented numbers and 6 of 6 traps refused.
- **Alternativas descartadas:** V0 "concisely": recall 0.36, dropped time periods; V1 "every step, then any timing or condition": recall 0.55, 1 false refusal and 1 invented number; Further tuning: stopped on purpose, more iterations against 17 questions would overfit
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/agent/answer.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-08 — Refusal threshold set to 0.30 with pass marks 90% / 85% / 95%
> **En palabras simples:** Se eligió un threshold de rechazo de 0.30 para mantener un margen de seguridad (0.12) desde las preguntas legítimas más bajas, rechazando temas fuera de alcance. Valores más altos como 0.45 rechazarían paráfrasis válidas con score 0.42.
- **Por qué:** Every value 0 to 0.40 gave the same end-to-end result and 0.45 refuses a legitimate paraphrase (top score 0.42). 0.30 keeps a 0.12 margin from the lowest answerable score while still refusing clearly off-topic questions before the model. Pass marks allow one question of slack each as regression alarms.
- **Alternativas descartadas:** 0.35 provisional: margin only 0.07; 0.40: margin only 0.02; 0.45: refuses legitimate paraphrase g09
- **Qué se rompe primero al escalar:** The data cannot tell values inside the plateau apart, so it is a judgement about margin, not a measured optimum; the 0.42 bound comes from a single question.
- **Fuente:** `src/config.ts`, `src/evals/passmarks.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-09 — Retrieval scored by section (article plus heading in top 3) instead of by article
> **En palabras simples:** Se eligió puntuar la recuperación por sección (artículo más encabezado) en lugar de solo por artículo, porque con 10 fragmentos (chunks) y 3 artículos, la puntuación a nivel de artículo era demasiado simple para diferenciar respuestas correctas.
- **Por qué:** The index has only 10 chunks and 3 articles, so top 3 cover 30% of it and article-level scoring is too easy; each answerable question lists its answering section headings (sourceHeadings).
- **Alternativas descartadas:** Article-level retrieval scoring: too easy with 10 chunks and 3 articles
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/evals/golden.json`, `src/evals/score.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-10 — Golden set written after the docs, with paraphrases, near-miss traps, injections and held-out questions (reemplazada por DEC-pos-support-chat-agent-with-rag-and-eval-14)

### DEC-pos-support-chat-agent-with-rag-and-eval-11 — Prompt-injection mitigations: delimiter neutralisation, separate sections, source taken from metadata, capped replies
> **En palabras simples:** Se eligió neutralizar delimitadores (secuencias de ), separar secciones y extraer la fuente del metadata porque el modelo de chat no tiene herramientas: lo peor que puede pasar es una respuesta equivocada o rechazada, no acceso a funciones peligrosas.
- **Por qué:** The chat model has no tools so the worst case is a wrong or refused answer; runs of three or more < or > are neutralised so prompt delimiters cannot be forged, and the Source line comes from chunk metadata, never model text.
- **Alternativas descartadas:** no hay decisión escrita
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/agent/answer.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-12 — Treat any reply containing NOT_IN_DOCS anywhere as a refusal (token strict, position not)
> **En palabras simples:** Se eligió buscar 'NOT_IN_DOCS' en cualquier posición de la respuesta, no solo como match exacto. Esto es mejor porque los modelos pequeños tienden a añadir palabras alrededor del centinela, y mostrar una respuesta incorrecta es peor que rechazarla de más.
- **Por qué:** Showing a possibly-wrong answer is worse than an extra refusal, and a small model often adds words around the sentinel.
- **Alternativas descartadas:** Exact full-reply match of NOT_IN_DOCS: small models add words around it
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/agent/answer.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-13 — Faithfulness scorer compares numbers by type and counts the question's own numbers as known
> **En palabras simples:** El evaluador de fidelidad diferencia números por tipo y considera conocidos los presentes en la pregunta, lo que evita falsos positivos donde montos inventados pasaban.
- **Por qué:** Bare-number checking let an invented "$5.00" pass because "5" appears in "5-7 business days"; and the model repeating the merchant's own "six weeks ago" was wrongly flagged. Both were fixed without touching the golden set or pass marks.
- **Alternativas descartadas:** Comparing bare numbers: lets invented amounts pass
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/evals/score.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-14 — Golden set of 23 questions written from the three articles after they were fixed, with 6 held-out questions, and its closeness to the source stated as a limit
> **En palabras simples:** Se evaluó con 23 preguntas de tres artículos cortos, reservando 6 para test independiente. Cada pregunta afecta el resultado (~4 puntos), lo que valida el dominio específico pero limita la generalización a otras fuentes.
- **Por qué:** The questions came from the same three short articles the model reads, with paraphrases, near-miss traps, injections and 6 held-out questions not used to tune the prompt or threshold. Because the author wrote both the articles and the questions, a clean score says little about other wording; the held-out ones have been looked at several times so they are only weakly independent.
- **Alternativas descartadas:** no hay decisión escrita
- **Qué se rompe primero al escalar:** With 23 questions one question moves a percentage by 4 points (25 for a held-out one), so the numbers are a demonstration, not a general accuracy claim.
- **Fuente:** `src/evals/golden.json`, `src/evals/golden.ts`, `README.md`
- **Registrada:** 2026-10-01

> 🔎 **Punto de control 2.** Antes de seguir, responde con tus palabras: `npm run genesis -- check 2 "<tu respuesta>"` (primero `npm run genesis -- check` te muestra la pregunta).

### DEC-pos-support-chat-agent-with-rag-and-eval-15 — Fully local and free stack: transformers.js embeddings (Xenova/all-MiniLM-L6-v2) and Ollama generation, no hosted API
> **En palabras simples:** Usar transformers.js (librería que ejecuta modelos en el navegador) con el modelo Xenova/all-MiniLM-L6-v2 para embeddings (representaciones vectoriales) y Ollama (servidor local para modelos de lenguaje) para generación. Así el proyecto es gratuito, sin claves API y completamente local.
- **Por qué:** The project had to be free and 100% local: no key and no cost, offline after setup, and anyone can clone it and run the evals without an account.
- **Alternativas descartadas:** Voyage AI for embeddings: needs a key and has a cost; Claude for generation: a hosted API needs a key and has a cost, and the project must be local and free; Claude as LLM-as-judge: same reason, key and cost
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/rag/embedder.ts`, `src/agent/ollama.ts`
- **Registrada:** 2026-10-01

### DEC-pos-support-chat-agent-with-rag-and-eval-16 — Deterministic evals (retrieval, faithfulness, correct refusal) instead of an LLM judge
> **En palabras simples:** Se eligieron evaluaciones determinísticas para retrieval y faithfulness en lugar de usar Claude como juez LLM, porque no necesitan clave API, no tienen costo y el sistema es reproducible. El tradeoff es que solo detectan datos faltantes o inventados, pero no frases sutilmente incorrectas.
- **Por qué:** No key, no cost, repeatable. The price is that faithfulness checks are a proxy for meaning: they catch missing or invented specifics but not a fluent, subtly wrong sentence.
- **Alternativas descartadas:** Claude as LLM-as-judge for faithfulness: needs a key and has a cost, and the project must be local and free
- **Qué se rompe primero al escalar:** no hay decisión escrita
- **Fuente:** `src/evals/score.ts`, `src/evals/report.ts`, `src/evals/run.ts`
- **Registrada:** 2026-10-01

> 🔎 **Punto de control 3.** Antes de seguir, responde con tus palabras: `npm run genesis -- check 3 "<tu respuesta>"` (primero `npm run genesis -- check` te muestra la pregunta).

## 3. Preguntas de entrevista (10 de 10 posibles)

1. **¿Por qué elegiste almacenar el índice de búsqueda como un archivo JSON en lugar de usar una vector database? ¿Qué limitaciones enfrenta este enfoque cuando el proyecto crece?**
   - Hechos obligatorios: JSON file; demo; 10 chunks; vector database; thousands of articles; retrieval tuning
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-05 (`src/rag/store.ts`, `src/rag/ingest.ts`)
2. **¿Por qué elegiste 0.30 y no 0.35 o 0.40, que permitirían responder más preguntas?**
   - Hechos obligatorios: 0.30 tiene margen de 0.12 desde el score más bajo respondible; 0.35 tiene margen de solo 0.07; 0.40 tiene margen de solo 0.02; Márgenes pequeños riesgan rechazar preguntas legítimas
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-08 (`src/config.ts`, `src/evals/passmarks.ts`)
3. **¿Qué implica para la confiabilidad que cada pregunta mueva el puntaje aproximadamente 4 puntos (25 para las held-out)?**
   - Hechos obligatorios: Con 23 preguntas, cada pregunta afecta aproximadamente 4 puntos del resultado; Para las preguntas held-out, una sola pregunta mueve 25 puntos; Los números demuestran el funcionamiento, no son un reclamo de precisión general o escalable
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-14 (`src/evals/golden.json`, `src/evals/golden.ts`, `README.md`)
4. **El modelo de 8B es más potente que el de 3B. ¿Qué pasó en la medición que te obligó a cambiar?**
   - Hechos obligatorios: llama3.1:8b tardaba 51 segundos en cargar; generaba 6-7 tokens por segundo (o 13.4 s para 2 tokens); excedía el timeout de 60 s de Ollama; no podía entregar respuestas reales dentro del tiempo límite
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-01 (`src/config.ts`, `.env.example`)
5. **¿Cómo validaste que necesitabas ambas capas y no solo una?**
   - Hechos obligatorios: El umbral de puntuación rechaza solo 2 de 8 preguntas que deben ser rechazadas; La señal NOT_IN_DOCS del modelo rechaza las otras 6; Ambas capas se mantienen porque juntas cubren todos los casos críticos
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-02 (`src/agent/answer.ts`)
6. **¿Por qué decidiste no indexar el título e introducción del documento junto con los fragmentos?**
   - Hechos obligatorios: el título e intro solo añaden ruido de recuperación; excluirlos proporciona una superficie de recuperación más limpia
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-06 (`src/rag/chunker.ts`)
7. **¿Por qué decidiste parar el tuning después de V2? ¿Qué hubieras arriesgado si continuabas iterando con más preguntas?**
   - Hechos obligatorios: más iteraciones contra las 17 tuning questions causaría overfitting; V2 ya alcanzaba 0.86 de recall con 0 números inventados y 6 de 6 traps rechazadas correctamente
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-07 (`src/agent/answer.ts`)
8. **¿Por qué rechazaste la puntuación a nivel de artículo entero? ¿Qué problema tenía ese enfoque?**
   - Hechos obligatorios: El índice tenía solo 10 chunks y 3 artículos; Los top 3 resultados cubrían el 30% del índice; La puntuación a nivel de artículo era demasiado fácil
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-09 (`src/evals/golden.json`, `src/evals/score.ts`)
9. **¿Por qué elegiste defensas contra prompt injection aunque el peor caso es solo una respuesta equivocada? ¿Qué riesgos específicos viste que justificaran estas mitigaciones en lugar de, por ejemplo, confiar en el rechazo del modelo?**
   - Hechos obligatorios: chat model has no tools; worst case is a wrong or refused answer; delimiter neutralisation
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-11 (`src/agent/answer.ts`)
10. **Primero intentaste detectar 'NOT_IN_DOCS' solo como respuesta exacta y completa. ¿Qué problema viste con los modelos pequeños que cambió tu enfoque?**
   - Hechos obligatorios: pequeños modelos frecuentemente añaden palabras alrededor del centinela; mostrar una respuesta posiblemente incorrecta es peor que una refusal extra
   - Fuente: DEC-pos-support-chat-agent-with-rag-and-eval-12 (`src/agent/answer.ts`)
