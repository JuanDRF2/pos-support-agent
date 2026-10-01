---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-13
project: pos-support-agent
topic: Type-aware number comparison in faithfulness scoring
format: card-v1
sources:
  - src/evals/score.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-13 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: b9a86a2c1775a9c4 -->
## Learn
A faithfulness scorer (a system that evaluates if an AI response matches source facts) prevents false positives by comparing numbers by type and treating the question's own numbers as known. This stops '$5' from matching '5 days' and prevents correct model repetitions from being flagged.

## Choose
Q: What does the type-aware number comparison prevent in a faithfulness scorer?
A) It stops the model from repeating any number mentioned in the question
B) It prevents '$5' matching '5 days' AND prevents flagging correct model repetitions of question numbers
C) It removes all numeric values from consideration
Correct: B
Why-not-A: Allowing model repetition helps, but type comparison is still needed to prevent '$5' matching '5 days'.
Why-not-C: Removing all numbers would let hallucinations with invented amounts pass undetected.

## Reveal
Answer: Type comparison prevents '$5' matching '5 days', and treating question numbers as known stops correct repetitions from being flagged.
Interview: Type-aware matching blocks cross-type mismatches while the model safely repeats question facts.

## Open
Q: The scorer flags 'costs $5' as hallucinated when the question says 'ships in 5-7 days'. What caused this and how does type-aware comparison fix it?
Keys:
- bare-number matching | comparing numbers without type context
- type comparison prevents cross-category matches | recognizing model repetitions of source numbers

## Fill
Q: The faithfulness scorer prevents false positives by comparing numbers based on their ____ , so '$5' won't match '5 days'.
Answer: type | category
