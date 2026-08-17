import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.adminjs/**',
      '**/next-env.d.ts',
      '**/logs/**',
      '**/.claude/worktrees/**',
      // Bo cong cu agent duoc cai vao repo ('.agents/', 'agents/'): do la ma nguon VENDOR cua
      // skill/plugin, khong phai ma nguon du an, va no khong theo rule TypeScript cua ta. De lai
      // thi mot lan cai skill se sinh hang nghin loi lint va CHAN moi lan push (17/08/2026: 1249
      // loi tren 32 tep, khong tep nao thuoc ma nguon du an).
      '**/.agents/**',
      'agents/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // NestJS DI dung class lam token runtime qua emitDecoratorMetadata:
    // ep `import type` se xoa import runtime -> hong DI. Tat rule cho api.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
);
