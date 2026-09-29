import type { ChatResult, GoldenEntry } from '../types.js'

// Deterministic scorers: no model and no network. They only compare text.

export type Answerable = Extract<GoldenEntry, { expect: 'answer' }>
export type RetrievedRef = { source: string; heading: string }

// Lower-case, straight quotes and dashes, no markdown emphasis, single spaces.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Category 1: the expected section (its article and one of its accepted headings) is among the
// retrieved chunks. With only three articles, matching the article alone would be too easy.
// Returns the 1-based position of the first matching chunk, or undefined when it was not retrieved.
export function retrievalRank(entry: Answerable, retrieved: readonly RetrievedRef[]): number | undefined {
  const index = retrieved.findIndex((chunk) => chunk.source === entry.sourceDoc && entry.sourceHeadings.includes(chunk.heading))
  return index === -1 ? undefined : index + 1
}

export const scoreRetrieval = (entry: Answerable, retrieved: readonly RetrievedRef[]): boolean => retrievalRank(entry, retrieved) !== undefined

// Category 3: traps must be refused, answerable questions must not be.
export function scoreRefusal(entry: GoldenEntry, result: ChatResult): boolean {
  return (result.kind === 'refusal') === (entry.expect === 'refusal')
}

// Spelled-out numbers count too, so "two receipts" in a chunk matches "2 receipts" in an answer.
// "one" is left out on purpose: it is mostly a pronoun ("the one you selected").
const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
}
const WORD_PATTERN = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi')

const amountOf = (raw: string) => String(Number(raw.replace(/,/g, '')))
const AMOUNT = '(\\d+(?:,\\d{3})*(?:\\.\\d+)?)'
const CURRENCY_BEFORE = new RegExp(`(?:\\$|€|£|\\busd\\b|\\beur\\b)\\s?${AMOUNT}`, 'gi')
const CURRENCY_AFTER = new RegExp(`${AMOUNT}\\s?(?:dollars?|euros?|usd|eur)\\b`, 'gi')
const TIME_PERIOD = /(\d+)(?:\s*(?:-|to)\s*(\d+))?[\s-]*(?:business\s+|calendar\s+|working\s+)?(second|minute|hour|day|week|month|year)s?\b/gi

// The facts an answer can get wrong, as tagged strings so that a type is never confused with another:
//   amount:5      "$5.00", "5 dollars"
//   time:7:day    "7 days", "7-day", "5-7 business days" (gives 5 and 7 days)
//   num:30        every other number, and the numbers inside time periods
// Without the tags, an invented "$5.00" would pass just because "5" appears in "5-7 business days".
// List markers ("3. ") and step labels ("Step 3") are not facts, so they are ignored. Spelled-out
// numbers count too ("two receipts" equals "2 receipts").
export function extractFacts(text: string): string[] {
  let rest = text
    .replace(/[–—]/g, '-')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\bsteps?\s+\d+(?:\s*(?:-|to|and|&)\s*\d+)?/gi, ' ')
    .replace(WORD_PATTERN, (word) => String(NUMBER_WORDS[word.toLowerCase()]))
  const facts = new Set<string>()
  for (const pattern of [CURRENCY_BEFORE, CURRENCY_AFTER]) {
    rest = rest.replace(pattern, (_, amount: string) => {
      facts.add(`amount:${amountOf(amount)}`)
      return ' '
    })
  }
  rest = rest.replace(TIME_PERIOD, (_, from: string, to: string | undefined, unit: string) => {
    for (const value of [from, to]) {
      if (value === undefined) continue
      facts.add(`time:${amountOf(value)}:${unit.toLowerCase()}`)
      facts.add(`num:${amountOf(value)}`)
    }
    return ' '
  })
  for (const match of rest.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) facts.add(`num:${amountOf(match[0])}`)
  return [...facts]
}

// Plain wording for a report ("14 days", "$5", "30"), without repeating a number that a more specific fact already names.
export function describeFacts(facts: readonly string[]): string[] {
  const covered = new Set(facts.filter((f) => !f.startsWith('num:')).map((f) => f.split(':')[1]))
  const words = facts.flatMap((fact) => {
    const [kind, value, unit] = fact.split(':')
    if (kind === 'amount') return [`$${value}`]
    if (kind === 'time') return [`${value} ${unit}${value === '1' ? '' : 's'}`]
    return covered.has(value) ? [] : [value]
  })
  return [...new Set(words)]
}

// Named options: text shown in bold (the articles bold every button and status) or in double quotes.
export function extractOptions(text: string): string[] {
  const found = new Set<string>()
  for (const pattern of [/\*\*([^*\n]+)\*\*/g, /"([^"\n]{2,})"/g, /“([^”\n]{2,})”/g]) {
    for (const match of text.matchAll(pattern)) {
      const option = normalize(match[1])
      if (option !== '') found.add(option)
    }
  }
  return [...found]
}

export type FaithfulnessDetail = {
  pass: boolean
  sourceOk: boolean
  missingPhrases: string[]
  unsupportedNumbers: string[]
  unsupportedOptions: string[]
}

// Category 2, for an answer that was given: (1) it cites the expected article, (2) it contains
// the key phrases, (3) every number, amount, time period and named option in it appears in the
// chunks the model was shown or in the question itself.
export function scoreFaithfulness(entry: Answerable, answer: Extract<ChatResult, { kind: 'answer' }>, chunkTexts: readonly string[]): FaithfulnessDetail {
  const sourceOk = answer.source === entry.sourceDoc
  const answerText = normalize(answer.text)
  const missingPhrases = entry.keyPhrases.filter((phrase) => !answerText.includes(normalize(phrase)))

  // What the merchant wrote counts as known too: repeating "six weeks" back to them is not inventing it.
  const context = [...chunkTexts, entry.question].join('\n')
  const knownFacts = new Set(extractFacts(context))
  const unsupportedNumbers = describeFacts(extractFacts(answer.text).filter((fact) => !knownFacts.has(fact)))
  const contextText = normalize(context)
  const unsupportedOptions = extractOptions(answer.text).filter((option) => !contextText.includes(option))

  return { pass: sourceOk && missingPhrases.length === 0 && unsupportedNumbers.length === 0 && unsupportedOptions.length === 0, sourceOk, missingPhrases, unsupportedNumbers, unsupportedOptions }
}

export function describeFaithfulness(detail: FaithfulnessDetail, expectedSource: string, actualSource: string): string {
  const reasons: string[] = []
  if (!detail.sourceOk) reasons.push(`cites ${actualSource}, expected ${expectedSource}`)
  if (detail.missingPhrases.length > 0) reasons.push(`missing key phrase ${detail.missingPhrases.map((p) => `"${p}"`).join(', ')}`)
  if (detail.unsupportedNumbers.length > 0) reasons.push(`number(s) not in the retrieved text: ${detail.unsupportedNumbers.join(', ')}`)
  if (detail.unsupportedOptions.length > 0) reasons.push(`option(s) not in the retrieved text: ${detail.unsupportedOptions.map((o) => `"${o}"`).join(', ')}`)
  return reasons.join('; ')
}
