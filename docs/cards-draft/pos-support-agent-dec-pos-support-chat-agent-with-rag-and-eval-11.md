---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-11
project: pos-support-agent
topic: Preventing Prompt Injection in RAG Chat
format: card-v1
sources:
  - src/agent/answer.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-11 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: d779ee3d3fb9fbb7 -->
## Learn
Chunk metadata (search result sources) is used instead of model output for citations. Delimiter characters < and > are neutralised to prevent forged prompts. Responses are capped because the model has no tools, so the worst case is a wrong answer.

## Choose
Q: Why does the chat agent source citations from chunk metadata instead of model output?
A) To prevent the model from forging false citations
B) To encrypt source data for user privacy
C) To reduce the computational cost of responses
Correct: A
Why-not-B: Encryption protects data confidentiality; metadata sourcing prevents injection risk.
Why-not-C: The design addresses injection security, not computational efficiency.

## Reveal
Answer: Using metadata for sources prevents the model from forging citations. Since the model has no tools, the worst risk is a wrong answer, so response length is capped to contain damage.
Interview: We take citations directly from metadata, not model output, to prevent forged sources, and we cap responses because the worst case is just a wrong answer.

## Open
Q: Name the three defence mechanisms and explain why each one is necessary given that the model has no tools.
Keys:
- delimiter neutralisation | neutralising runs of < or > | preventing forged prompt boundaries
- metadata-sourced citations | Source from chunk metadata | preventing the model from forging sources
- capped response length | limited reply length | containing damage from wrong answers

## Fill
Q: The chat agent prevents prompt injection through delimiter neutralisation, extracting Source from ____, and capping response length.
Answer: chunk metadata | metadata | retrieved chunks
