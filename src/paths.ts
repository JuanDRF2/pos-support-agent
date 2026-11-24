import { fileURLToPath } from 'node:url'

// Resolve a path relative to a module URL into a real filesystem path. `new URL(...).pathname` keeps
// percent-encoding ("%20" for a space) and gives "/C:/..." on Windows; fileURLToPath handles both.
export function resolveFromModule(relative: string, moduleUrl: string): string {
  return fileURLToPath(new URL(relative, moduleUrl))
}
