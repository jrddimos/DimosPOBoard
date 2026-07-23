module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '*.cjs'],
  rules: {
    // tsc (noUnusedLocals/noUnusedParameters) couvre déjà ça pour le code
    // typé — la règle de base ESLint ne comprend pas les types et produit
    // des faux positifs sur des constructions TS valides.
    'no-unused-vars': 'off',
    // ignoreRestSiblings : couvre `const { id: _id, ...rest } = t` (extraire
    // des champs juste pour les exclure d'un ...rest, cf. useProduits.ts).
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    '@typescript-eslint/no-explicit-any': 'off',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Pattern répandu dans le code existant : `try { localStorage.setItem(...) } catch {}`
    // pour des écritures best-effort dont l'échec (quota, mode privé…) n'a
    // rien d'exceptionnel à gérer.
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
}
