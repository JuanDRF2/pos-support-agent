---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-14
project: pos-support-agent
topic: Golden set evaluation for RAG chat agents
format: card-v1
sources:
  - src/evals/golden.json
  - src/evals/golden.ts
  - README.md
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-14 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: b91ab420414daade -->
## Learn
A golden set is a curated collection of test questions used to measure model performance. For RAG chat agents (which retrieve source articles before answering), include paraphrases and near-miss traps to test real performance on the material the model uses.

## Choose
Q: Why hold out questions from prompt tuning in your golden set?
A) To prove the model generalizes to domains beyond the training articles
B) To test real performance without overfitting to the tuning set
C) To show the model works on any question regardless of training material
Correct: B
Why-not-A: All questions come from the same three articles the model reads, so held-out questions do not prove generalization beyond that source.
Why-not-C: Held-out questions come from the same articles; they prevent tuning bias but do not guarantee domain transfer.

## Reveal
Answer: Held-out questions measure true performance without tuning bias. Results apply only to these articles, not other domains.
Interview: We held out six questions to prevent tuning overfitting, which gives us a clearer performance reading.

## Open
Q: How does a 23-question golden set limit confidence in the accuracy metrics?
Keys:
- One question moves accuracy by 4 percentage points | Each question significantly shifts the accuracy metric
- The numbers demonstrate relative performance patterns only | Results show performance on these source articles, not general accuracy

## Fill
Q: With only 23 questions in the golden set, each one changes the evaluation ____ by approximately 4 percentage points.
Answer: metric | score
