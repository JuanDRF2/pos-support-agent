---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-03
project: pos-support-agent
topic: Local RAG without APIs
format: card-v1
sources:
  - src/rag/embedder.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-03 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: aaf352c509638765 -->
## Learn
This project uses transformers.js (a library that runs neural network models locally) for embeddings and Ollama (a local LLM runtime) for generation. No external APIs. This enables offline operation, requires no API keys, and anyone can reproduce it by cloning the repo without paying or creating accounts.

## Choose
Q: Why did the author choose transformers.js and Ollama instead of Voyage AI and Claude API?
A) The company policy required all data to remain on-premises for security
B) Cost-free and offline-capable; anyone can reproduce it without API keys or paid accounts
C) These tools produce better embeddings and generation quality than commercial APIs
Correct: B
Why-not-A: No company security requirement was mentioned; the author lacked API access on their plan.
Why-not-C: Quality differences were not the decision factor; cost and reproducibility were.

## Reveal
Answer: Offline operation and reproducibility for anyone cloning the repository without API keys. The author had no API access on their plan, making local solutions essential.
Interview: We needed to build locally because we had no API access and wanted anyone to clone and run the evals without paying or creating accounts.

## Open
Q: What two technical components enable this fully local pipeline?
Keys:
- transformers.js | embedding model | Xenova/all-MiniLM-L6-v2
- Ollama | local generation | text generation runtime

## Fill
Q: This project creates embeddings using ____ , which runs locally without external API calls.
Answer: transformers.js | the Xenova/all-MiniLM-L6-v2 model
