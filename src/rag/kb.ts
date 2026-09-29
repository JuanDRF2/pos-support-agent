import { readFileSync } from 'node:fs'
import { KB_FILES } from '../config.js'

// Fixed folder and fixed file list: nothing here comes from a request, an env var or a glob.
export function loadDocs(): Record<string, string> {
  const docs: Record<string, string> = {}
  for (const file of KB_FILES) docs[file] = readFileSync(new URL(`../../docs/kb/${file}`, import.meta.url), 'utf8')
  return docs
}
