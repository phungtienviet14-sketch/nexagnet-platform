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
    // Ma cua tien ich Chrome (Conversation Bridge V0) chay trong SERVICE WORKER cua trinh duyet,
    // khong trong Node — nen `chrome`, `document`, `location` la bien toan cuc hop le o day, va
    // `globals.node` cua khoi mac dinh ben tren khong mo ta dung moi truong do.
    //
    // Pham vi CO Y hep toi dung `tools/conversation-bridge/extension/`: khong mot tep Node nao
    // trong kho duoc huong cac bien toan cuc cua trinh duyet chi vi mot tien ich can chung.
    files: ['tools/conversation-bridge/extension/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    // `declare var` la CACH DUY NHAT khai mot bien toan cuc moi truong (`document`, `location`)
    // trong mot tep khai bao. `let`/`const` o day khong tuong duong: chung khong tao thuoc tinh
    // toan cuc, nen `no-var` doi hoi mot thu khong dien dat duoc dieu can dien dat.
    files: ['**/*.d.ts'],
    rules: { 'no-var': 'off' },
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
