// Minimum share of questions (0 to 1) each category must reach for `npm test` to pass.
//
// Set in task 11 and approved by Juan. They are regression alarms, not goals: each allows exactly
// one question of slack against what was measured (retrieval 15 of 15, faithfulness 14 of 15,
// correct refusal 23 of 23), so a second miss fails the run.
//   retrieval    0.90 -> at least 14 of 15
//   faithfulness 0.85 -> at least 13 of 15 (the known miss on g14 plus one more)
//   refusal      0.95 -> at least 22 of 23
// The held-out questions are reported separately and do not gate: there are only 6 of them, so each
// one moves the percentage by 25 points.
export type Category = 'retrieval' | 'faithfulness' | 'refusal'
export type PassMarks = Record<Category, number | null>

export const PASS_MARKS: PassMarks = {
  retrieval: 0.9,
  faithfulness: 0.85,
  refusal: 0.95,
}
