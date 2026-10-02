---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-15
project: pos-support-agent
topic: Offline AI Stack Without Hosted APIs
format: card-v1
sources:
  - src/rag/embedder.ts
  - src/agent/ollama.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-15 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: 2d4d4a2722d4d471 -->
## Learn
The project uses transformers.js embeddings (numerical representations of text converted locally) with the Xenova/all-MiniLM-L6-v2 model and Ollama generation (running a language model offline) to eliminate API keys and costs.

## Choose
Q: Why did the project reject Voyage AI for embeddings?
A) It produces lower-quality embeddings than open-source alternatives
B) It requires an API key and costs money
C) It requires significant computational resources that transformers.js cannot handle
Correct: B
Why-not-A: Quality was not the reason stated in the decision record; cost and API key requirements were the issue.
Why-not-C: Resource constraints were not mentioned; the decision was driven by cost and API key requirements.

## Reveal
Answer: Voyage AI requires an API key and costs money. The project needed a free, offline-after-setup solution with no external dependencies or costs.
Interview: We rejected Voyage AI because it needs a paid API key, and our project had to be completely free and run locally.

## Open
Q: Why does the project use two separate local components (transformers.js for embeddings and Ollama for generation) instead of a single hosted service?
Keys:
- transformers.js | Xenova | all-MiniLM-L6-v2 | local embeddings | embedding model
- Ollama | local generation | offline language model | local LLM | text generation

## Fill
Q: The project integrates _____ as its local embedding model through transformers.js to eliminate the need for external services and API keys.
Answer: Xenova/all-MiniLM-L6-v2 | all-MiniLM-L6-v2 | Xenova
