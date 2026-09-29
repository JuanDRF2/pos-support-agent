export type Chunk = {
  source: string
  heading: string
  text: string
}

export type ChatResult =
  | { kind: 'answer'; text: string; source: string }
  | { kind: 'refusal'; text: string }

export type KbFile = (typeof import('./config.js').KB_FILES)[number]

export type GoldenType = 'direct' | 'paraphrase' | 'trap' | 'injection'

// Answerable questions name the expected article, the section heading(s) that answer them (any
// one of them counts) and the phrases a good answer must contain. Trap and injection questions
// must be refused.
export type GoldenEntry =
  | { id: string; type: 'direct' | 'paraphrase'; heldOut: boolean; question: string; expect: 'answer'; sourceDoc: KbFile; sourceHeadings: string[]; keyPhrases: string[] }
  | { id: string; type: 'trap' | 'injection'; heldOut: boolean; question: string; expect: 'refusal' }
