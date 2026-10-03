<!-- GENERATED from the decision ledger and the project docs by `genesis manual`. Do not edit by hand. -->
<!-- manual-digest: 78280a083d3fb61b -->

# Manual: pos-support-agent

## En 30 segundos
- Es un chat de soporte para comerciantes de un sistema POS (punto de venta). Responde solo con tres artículos de ayuda; si no cubren la pregunta, lo dice y sugiere contactar a soporte. _(fuente: `README.md`)_
- Es una demo: los artículos son sintéticos, no se conecta a un POS real, no tiene login ni guarda historial, y corre solo en localhost. _(fuente: `README.md`)_

## Para qué existe
- El objetivo no es la ventana de chat, sino mostrar RAG (retrieval-augmented generation: buscar texto relevante y responder con él) real y evals (pruebas de calidad) repetibles, en una laptop, sin claves ni costo. _(fuente: `README.md`)_
- Está pensado para comerciantes que preguntan cosas como reembolsos parciales, y para quien quiera clonar el proyecto y correr las evals sin cuenta. _(fuente: `README.md`)_

## Cómo funciona
- La pregunta se convierte en embedding (lista de números que representa el significado) localmente y se buscan las secciones más cercanas de los artículos. _(fuente: `README.md`)_
- Si la mejor coincidencia es débil, el código rechaza sin llamar al modelo. Si no, un modelo local escribe la respuesta solo con esas secciones. _(fuente: `README.md`)_
- Si el modelo responde NOT_IN_DOCS (señal de que no hay respuesta en los documentos), también se rechaza. Si no, se da la respuesta con la fuente citada. _(fuente: `README.md`)_
- Los embeddings usan Xenova/all-MiniLM-L6-v2 y las respuestas un modelo de Ollama (llama3.2:3b por defecto), ambos en tu máquina. _(fuente: `README.md`)_

## Cómo se usa
- Requisitos: Node.js 20 o más, Ollama funcionando, unos 2 GB de disco e internet una sola vez para bajar el modelo de embeddings (~23 MB). _(fuente: `README.md`)_
- Instalación: npm install, ollama pull llama3.2:3b, y npm run ingest (descarga y verifica el modelo de embeddings y crea data/index.json). _(fuente: `README.md`)_
- Para usarlo, ejecuta npm run dev y abre el chat en http://localhost:3000. Puedes cambiar el puerto con PORT, por ejemplo PORT=4000 npm run dev. _(fuente: `README.md`)_
- La configuración se lee de variables de entorno (OLLAMA_MODEL, REFUSAL_THRESHOLD, TOP_K, PORT); el proyecto no carga un archivo .env por sí mismo. _(fuente: `README.md`)_

## Qué NO hace (límites)
- Es de un solo turno y solo en inglés: cada pregunta es independiente, sin memoria entre preguntas. _(fuente: `README.md`)_
- Solo busca en tres artículos; nada más se consulta. _(fuente: `README.md`)_
- El modelo no tiene herramientas ni puede tomar acciones; lo peor que puede pasar con una pregunta hostil es una respuesta errónea o rechazada. _(fuente: `README.md`)_
- Los números son una demostración: 23 preguntas, mismo autor para preguntas y artículos, y la faithfulness (fidelidad a las fuentes) es solo un proxy que no entiende el significado. _(fuente: `README.md`)_

## Por qué se construyó así
- **Switch default generation model from llama3.1:8b to llama3.2:3b after measuring on 8 GB RAM:** The 8B model took 51 s to load and 13.4 s to generate 2 tokens, which would blow the 60 s Ollama timeout so no real answer could work. The 3B loaded in about 7 s and generated at about 25 tokens/s. It was a measured performance failure, not a preference. _(fuente: `src/config.ts`, `.env.example`)_
- **Refusal is decided in code in two layers: a retrieval score threshold (no model call) plus a NOT_IN_DOCS signal from the model:** A small local model invents things easily. Deciding in code makes refusal deterministic and testable, and the threshold is a second layer under the prompt. Measured: the threshold alone refuses only 2 of 8 must-refuse questions; the other 6 were refused by the model's NOT_IN_DOCS, so both layers are kept. _(fuente: `src/agent/answer.ts`)_
- **Search index stored as a single JSON file (data/index.json) held in memory, with cosine top-k, validated on load:** Simple local storage for a demo with 10 chunks. The store validates model, revision, 384 dimensions, known sources and finite numbers, and any mismatch tells the user to run npm run ingest. _(fuente: `src/rag/store.ts`, `src/rag/ingest.ts`)_
- **Chunk by `##` section, keeping numbered lists whole and splitting only above 1,500 characters between blocks:** Steps of a procedure such as the partial refund must never get separated, and not indexing the title/intro gives a cleaner retrieval surface with less noise. _(fuente: `src/rag/chunker.ts`)_
- **System prompt changed from "concisely" to "answer completely" (V2):** The model stopped on its own after 55 tokens, not due to the token cap. On 17 tuning questions, V2 raised recall of the article's numbers from 0.36 to 0.86 with 0 invented numbers and 6 of 6 traps refused. _(fuente: `src/agent/answer.ts`)_
- **Refusal threshold set to 0.30 with pass marks 90% / 85% / 95%:** Every value 0 to 0.40 gave the same end-to-end result and 0.45 refuses a legitimate paraphrase (top score 0.42). 0.30 keeps a 0.12 margin from the lowest answerable score while still refusing clearly off-topic questions before the model. Pass marks allow one question of slack each as regression alarms. _(fuente: `src/config.ts`, `src/evals/passmarks.ts`)_
- **Retrieval scored by section (article plus heading in top 3) instead of by article:** The index has only 10 chunks and 3 articles, so top 3 cover 30% of it and article-level scoring is too easy; each answerable question lists its answering section headings (sourceHeadings). _(fuente: `src/evals/golden.json`, `src/evals/score.ts`)_
- **Prompt-injection mitigations: delimiter neutralisation, separate sections, source taken from metadata, capped replies:** The chat model has no tools so the worst case is a wrong or refused answer; runs of three or more < or > are neutralised so prompt delimiters cannot be forged, and the Source line comes from chunk metadata, never model text. _(fuente: `src/agent/answer.ts`)_
- **Treat any reply containing NOT_IN_DOCS anywhere as a refusal (token strict, position not):** Showing a possibly-wrong answer is worse than an extra refusal, and a small model often adds words around the sentinel. _(fuente: `src/agent/answer.ts`)_
- **Faithfulness scorer compares numbers by type and counts the question's own numbers as known:** Bare-number checking let an invented "$5.00" pass because "5" appears in "5-7 business days"; and the model repeating the merchant's own "six weeks ago" was wrongly flagged. Both were fixed without touching the golden set or pass marks. _(fuente: `src/evals/score.ts`)_
- **Golden set of 23 questions written from the three articles after they were fixed, with 6 held-out questions, and its closeness to the source stated as a limit:** The questions came from the same three short articles the model reads, with paraphrases, near-miss traps, injections and 6 held-out questions not used to tune the prompt or threshold. Because the author wrote both the articles and the questions, a clean score says little about other wording; the held-out ones have been looked at several times so they are only weakly independent. _(fuente: `src/evals/golden.json`, `src/evals/golden.ts`, `README.md`)_
- **Fully local and free stack: transformers.js embeddings (Xenova/all-MiniLM-L6-v2) and Ollama generation, no hosted API:** The project had to be free and 100% local: no key and no cost, offline after setup, and anyone can clone it and run the evals without an account. _(fuente: `src/rag/embedder.ts`, `src/agent/ollama.ts`)_
- **Deterministic evals (retrieval, faithfulness, correct refusal) instead of an LLM judge:** No key, no cost, repeatable. The price is that faithfulness checks are a proxy for meaning: they catch missing or invented specifics but not a fluent, subtly wrong sentence. _(fuente: `src/evals/score.ts`, `src/evals/report.ts`, `src/evals/run.ts`)_

Mapa de decisiones y archivos (solo lo que el registro cita):

```mermaid
flowchart LR
  D1["Switch default generation model from llama3…"]
  D2["Refusal is decided in code in two layers: a…"]
  D3["Search index stored as a single JSON file (…"]
  D4["Chunk by ## section, keeping numbered lists…"]
  D5["System prompt changed from concisely to ans…"]
  D6["Refusal threshold set to 0.30 with pass mar…"]
  D7["Retrieval scored by section (article plus h…"]
  D8["Prompt-injection mitigations: delimiter neu…"]
  D9["Treat any reply containing NOT_IN_DOCS anyw…"]
  D10["Faithfulness scorer compares numbers by typ…"]
  D11["Golden set of 23 questions written from the…"]
  D12["Fully local and free stack: transformers.js…"]
  D13["Deterministic evals (retrieval, faithfulnes…"]
  F1["src/config.ts"]
  F2[".env.example"]
  F3["src/agent/answer.ts"]
  F4["src/rag/store.ts"]
  F5["src/rag/ingest.ts"]
  F6["src/rag/chunker.ts"]
  F7["src/evals/passmarks.ts"]
  F8["src/evals/golden.json"]
  F9["src/evals/score.ts"]
  F10["src/evals/golden.ts"]
  F11["README.md"]
  F12["src/rag/embedder.ts"]
  F13["src/agent/ollama.ts"]
  F14["src/evals/report.ts"]
  F15["src/evals/run.ts"]
  D1 --> F1
  D1 --> F2
  D2 --> F3
  D3 --> F4
  D3 --> F5
  D4 --> F6
  D5 --> F3
  D6 --> F1
  D6 --> F7
  D7 --> F8
  D7 --> F9
  D8 --> F3
  D9 --> F3
  D10 --> F9
  D11 --> F8
  D11 --> F10
  D11 --> F11
  D12 --> F12
  D12 --> F13
  D13 --> F9
  D13 --> F14
  D13 --> F15
```

## Cómo saber si está roto
- npm run verify hace typecheck, lint, tests unitarios, eval:fast y build, sin necesitar Ollama. npm test corre además la eval completa y sí necesita Ollama. _(fuente: `README.md`)_
- npm test falla si una categoría no llega a su mínimo o no pudo puntuarse completa; nunca inventa un número: lo no ejecutado dice SKIPPED. _(fuente: `README.md`)_
- Si no alcanza Ollama, ejecuta ollama serve o abre la app de Ollama. Si falta el modelo, ollama pull llama3.2:3b. _(fuente: `README.md`)_
- Si el índice no se encuentra o su hash no coincide, corre npm run ingest. Si el puerto 3000 está ocupado, cambia PORT. _(fuente: `README.md`)_
- La primera respuesta tras una pausa tarda 15 a 30 segundos porque Ollama recarga el modelo. _(fuente: `README.md`)_

## Datos y secretos
- Los datos son solo los tres artículos de docs/kb/ y el índice generado en data/index.json. No se guarda historial. _(fuente: `README.md`)_
- El texto de las preguntas nunca se escribe en los logs. _(fuente: `README.md`)_
- Lo único externo que se contacta es huggingface.co, una vez, para bajar el modelo de embeddings, cuyos archivos se verifican con hashes SHA-256 fijos. _(fuente: `README.md`)_
- No requiere claves ni cuentas. El servidor escucha solo en 127.0.0.1 y rechaza otros Host, evitando uso desde otros sitios web. _(fuente: `README.md`)_

## Qué cambiaría al crecer
- A JSON file with 10 chunks works for a demo; thousands of articles need an actual vector database, and retrieval tuning becomes its own project at that size. _(DEC-pos-support-chat-agent-with-rag-and-eval-05)_
- The data cannot tell values inside the plateau apart, so it is a judgement about margin, not a measured optimum; the 0.42 bound comes from a single question. _(DEC-pos-support-chat-agent-with-rag-and-eval-08)_
- With 23 questions one question moves a percentage by 4 points (25 for a held-out one), so the numbers are a demonstration, not a general accuracy claim. _(DEC-pos-support-chat-agent-with-rag-and-eval-14)_

## Medida de éxito
- La golden set (conjunto de preguntas de referencia) tiene 23 preguntas: 8 directas, 7 paráfrasis, 6 trampas cercanas y 2 inyecciones de prompt; 6 están reservadas (held-out). _(fuente: `README.md`)_
- Se miden tres categorías con chequeos de texto deterministas, sin juez de IA: retrieval, faithfulness y correct refusal. _(fuente: `README.md`)_
- Mínimos de aprobación: 90% retrieval, 85% faithfulness y 95% correct refusal, con margen de una pregunta. _(fuente: `README.md`)_
- Resultado de una corrida: retrieval 15/15, faithfulness 14/15 (93%), correct refusal 23/23. El único fallo omitió que pedidos viejos van a soporte general. _(fuente: `README.md`)_
