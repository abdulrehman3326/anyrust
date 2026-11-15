import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// A feature may only be imported through its public index.ts.
const featureBoundary = {
  patterns: [
    {
      group: ['@/features/*/*', '**/features/*/*'],
      message: 'Import a feature through its public index.ts, not its internals.',
    },
  ],
};

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-imports': ['error', featureBoundary],
      // All colors live in shared/styles/globals.css.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message: 'Define colors in shared/styles/globals.css and use Tailwind theme tokens.',
        },
        {
          selector: "Literal[value=/^(rgb|hsl)a?[(]/]",
          message: 'Define colors in shared/styles/globals.css and use Tailwind theme tokens.',
        },
      ],
    },
  },
);
