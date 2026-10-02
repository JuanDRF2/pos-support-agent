---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-05
project: pos-support-agent
topic: In-Memory JSON Search Index
format: card-v1
sources:
  - src/rag/store.ts
  - src/rag/ingest.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-05 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: 19df5e6749b4c64e -->
## Learn
An embedding is a vector representing meaning. Store embeddings in one JSON file (data/index.json) in memory, retrieve top-k matches using cosine similarity—the distance metric between vectors—and validate model revision, 384 dimensions, and known sources on load.

## Choose
Q: When should you replace this JSON file with a vector database?
A) When you have thousands of chunks
B) When you want user authentication
C) When you support multiple languages
Correct: A
Why-not-B: Authentication is separate from data storage.
Why-not-C: Language support does not require changing storage.

## Reveal
Answer: The JSON approach works for 10 chunks, but thousands of articles need a vector database and retrieval tuning becomes complex.
Interview: We used JSON for the demo's 10 chunks, but production search at scale needs a vector database.

## Open
Q: What must validation check when loading data/index.json, and what does a mismatch tell the user?
Keys:
- model | revision | model version
- 384 dimensions | vector size | embedding dimensions
- known sources | chunk sources
- run npm run ingest | rerun ingest | re-ingest

## Fill
Q: A JSON file with ____ chunks works for this demo but requires a vector database for production scale.
Answer: 10
