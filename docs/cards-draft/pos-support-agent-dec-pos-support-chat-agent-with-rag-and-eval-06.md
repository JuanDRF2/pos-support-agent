---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-06
project: pos-support-agent
topic: RAG chunking for support documents
format: card-v1
sources:
  - src/rag/chunker.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-06 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: 636ebb2229a73758 -->
## Learn
In RAG (Retrieval-Augmented Generation—a system retrieving documents to augment AI responses), chunk support content by markdown sections (##), keep numbered procedures whole, and split only above 1,500 characters. This prevents procedural steps from being separated while maintaining retrieval quality.

## Choose
Q: When chunking support documents for RAG, why exclude the title and intro text before the first markdown section (##)?
A) They add retrieval noise without providing necessary context
B) They exceed the 1,500 character limit that applies to each chunk
C) Including them provides wider context that improves retrieval relevance
Correct: A
Why-not-B: The 1,500 character limit applies to splitting within sections, not to title/intro content.
Why-not-C: Wider context causes retrieval noise; excluding title/intro improves search quality.

## Reveal
Answer: Title and intro text add retrieval noise without improving matches. Chunks should start at the first ## section for cleaner results.
Interview: We exclude titles and intros because they reduce the signal-to-noise ratio in retrieval.

## Open
Q: What two key design constraints shape this chunking strategy for support documents?
Keys:
- Numbered lists and procedures must not be separated across chunks | procedural steps must remain whole | procedures like refunds cannot be split
- Chunks are limited to 1,500 characters when splitting between sections | the 1,500 character threshold determines where chunks break | large sections split only at the size boundary

## Fill
Q: To prevent procedural steps from being separated, numbered lists should be kept ____ when chunking by markdown sections.
Answer: whole | together | intact | unsplit
