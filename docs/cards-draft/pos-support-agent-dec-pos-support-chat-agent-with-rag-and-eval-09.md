---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-09
project: pos-support-agent
topic: Section-level retrieval scoring in RAG
format: card-v1
sources:
  - src/evals/golden.json
  - src/evals/score.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-09 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: e86141b690dd28cf -->
## Learn
Retrieval-augmented generation (RAG) scores whether the right information was retrieved. With only 3 articles and 10 chunks, article-level scoring is too easy; section-level scoring (article plus heading) is more discriminative.

## Choose
Q: Why did the team choose section-level over article-level scoring?
A) Sections create better embeddings than articles.
B) With 3 articles and 10 chunks, top 3 results would likely hit all articles, making article-level scoring insufficiently selective.
C) The vector database cannot retrieve at article level.
Correct: B
Why-not-A: Embedding quality doesn't depend on granularity.
Why-not-C: Vector databases work at any granularity; the choice reflects evaluation needs.

## Reveal
Answer: Top 3 retrieval at article level would cover most or all 3 articles, making the metric too permissive. Section-level (article plus heading) is more selective.
Interview: With only 3 articles and 10 chunks, article-level scoring was too easy to distinguish good retrieval.

## Open
Q: What role does sourceHeadings data in golden.json play in section-level evaluation?
Keys:
- Each question is labeled with sourceHeadings, identifying the article and heading of sections that answer it
- The evaluation in score.ts compares retrieved sections against these labeled sourceHeadings

## Fill
Q: The evaluation uses ____ and heading pairs as the atomic unit for scoring whether retrieval was correct.
Answer: article
