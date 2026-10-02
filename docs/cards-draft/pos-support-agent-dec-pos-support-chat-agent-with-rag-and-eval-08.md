---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-08
project: pos-support-agent
topic: Refusal threshold margin in chat agents
format: card-v1
sources:
  - src/config.ts
  - src/evals/passmarks.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-08 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: 5615f3942b161ae6 -->
## Learn
Refusal threshold is the confidence score below which a chat agent refuses to answer. The team chose 0.30 because testing found that all values 0–0.40 produced identical results, so 0.30 was selected for its 0.12 safety margin rather than statistical optimization.

## Choose
Q: Why did the team choose 0.30 instead of searching for the statistically optimal threshold?
A) All thresholds from 0 to 0.40 performed identically, so they chose 0.30 for its 0.12 margin above the lowest answerable score.
B) The value 0.30 is the industry-standard default for chat agent refusals.
C) 0.30 produced the highest F1 score when tested against their evaluation dataset.
Correct: A
Why-not-B: There is no universal industry standard; each system needs its own threshold tuned to its own data.
Why-not-C: The plateau effect meant multiple values performed equally, so this was not an optimization problem where one value beats others.

## Reveal
Answer: All thresholds 0–0.40 gave identical end-to-end results. The team chose 0.30 for its 0.12 margin above the 0.42 score where legitimate questions still answered correctly.
Interview: It was a performance plateau, so we chose based on margin safety rather than finding a peak.

## Open
Q: What evidence would justify selecting a different threshold for another domain?
Keys:
- the plateau behavior could be different in other data | the lowest answerable score might be higher or lower | performance at each threshold depends on the training data
- the acceptable margin depends on the domain's use case and tolerance for refusal | the cost of refusing legitimate questions versus false positives is domain-specific | safety and reliability requirements vary by application and user expectations

## Fill
Q: The team maintained a ____ between their 0.30 threshold and the 0.42 lowest answerable score to prevent over-refusing legitimate paraphrases.
Answer: margin | safety margin | buffer | gap | cushion
