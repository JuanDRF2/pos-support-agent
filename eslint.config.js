import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

// Standard TypeScript rules. No Nx boundary rules — this is a standalone project.
export default tseslint.config(
  // .genesis/ is Genesis's own tooling, not project code.
  { ignores: ['dist/**', 'node_modules/**', '.genesis/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
)
