import { checkAgainstDocs, countByType, loadDocs, loadGolden } from './golden.js'

const entries = loadGolden()
checkAgainstDocs(entries, loadDocs())
console.log('golden set OK', countByType(entries))
