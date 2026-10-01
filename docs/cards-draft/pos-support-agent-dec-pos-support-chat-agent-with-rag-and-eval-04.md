---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-04
project: pos-support-agent
topic: Deterministic evals instead of LLM judge
format: card-v1
sources:
  - src/evals/score.ts
  - src/evals/report.ts
  - src/evals/run.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-04 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: fbba5fcad17be115 -->
## Learn
Use deterministic rule-based checks for retrieval accuracy, whether text matches context (faithfulness), and correct refusal—instead of an LLM judge. This avoids API costs and is repeatable, but catches missing or invented facts better than subtle semantic errors.

## Choose
Q: When evaluating a RAG chat agent's responses, which approach avoids API dependency and cost while remaining repeatable?
A) Use Claude API to evaluate whether each response is grounded in retrieved context
B) Only verify exact keyword matches between retrieved documents and the generated response
C) Use deterministic rules to check retrieval accuracy, faithfulness, and correct refusal
Correct: C
Why-not-A: API was unavailable on the plan; external LLM evaluation adds cost and dependency.
Why-not-B: Keyword matching cannot verify that retrieved context actually supports the response's meaning.

## Reveal
Answer: Deterministic evals check retrieval, faithfulness, and refusal using explicit rules, not an LLM. They catch missing or invented facts but miss subtle semantic errors.
Interview: We chose deterministic rules instead of an LLM judge for cost and repeatability, though they miss nuanced semantic errors.

## Open
Q: Why is a faithfulness check that verifies whether generated text matches retrieved context called a proxy measure?
Keys:
- catches missing facts | detects invented details | identifies ungrounded specifics
- misses subtle errors | doesn't catch semantic drift | allows fluent but slightly wrong outputs

## Fill
Q: A faithfulness check that verifies whether text matches retrieved context is a ____ measure because it catches explicit errors but not nuanced semantic mistakes.
Answer: proxy | imperfect | indirect
