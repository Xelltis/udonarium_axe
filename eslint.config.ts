import eslint from '@eslint/js';
import angular from 'angular-eslint';
import { defineConfig } from 'eslint/config';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import prettierPlugin from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

/* レイヤー境界ルール
 * 依存方向（厳格）: features → ui → application → infrastructure → domain → core
 *                                  ↘──────────────────↗ (application は domain も直接読む)
 * `composition`（src/app/*.ts 直下: app.component / *-event-handler.service 等）は
 *  全層に依存可能（コンポジションルート）。
 */
const NO_RELATIVE_IMPORT = {
  regex: '^\\.',
  message: '相対パスインポートは禁止です。パスエイリアス（@axe/...）を使用してください。',
};
const LAYER_MESSAGE = (forbidden: string) =>
  `[layer] ${forbidden} 層への逆流 import は禁止です。依存方向: features → ui → application → infrastructure → domain → core`;

const FORBID_FOR_CORE = {
  regex: '^@axe/(domain|infrastructure|application|ui|features)/',
  message: LAYER_MESSAGE('domain/infrastructure/application/ui/features'),
};
const FORBID_FOR_DOMAIN = {
  regex: '^@axe/(infrastructure|application|ui|features)/',
  message: LAYER_MESSAGE('infrastructure/application/ui/features'),
};
const FORBID_FOR_INFRASTRUCTURE = {
  regex: '^@axe/(application|ui|features)/',
  message: LAYER_MESSAGE('application/ui/features'),
};
const FORBID_FOR_APPLICATION = {
  // application は domain / core / infrastructure を呼べる。ui / features は不可。
  regex: '^@axe/(ui|features)/',
  message: LAYER_MESSAGE('ui/features'),
};
const FORBID_FOR_UI = {
  regex: '^@axe/features/',
  message: LAYER_MESSAGE('features'),
};

/* feature 同士の import は今ある辺だけを許す。新しい辺は意図してここに足す（増やさない方向）。 */
const FEATURE_DEPENDENCIES: Record<string, readonly string[]> = {
  alarm: [],
  buff: [],
  card: [],
  character: ['card', 'data-element', 'disclosure', 'tabletop'],
  chat: ['data-element', 'hotbar', 'visual-novel'],
  coin: [],
  controller: [],
  'data-element': ['tabletop'],
  dice: [],
  disclosure: [],
  effect: ['hotbar'],
  file: [],
  'gm-object-list': ['disclosure', 'gm-tools', 'tabletop'],
  'gm-tools': ['card', 'chat'],
  hotbar: ['pl-tools', 'visual-novel'],
  inventory: ['gm-tools'],
  'language-selector': [],
  lobby: [],
  'map-editor': ['tabletop'],
  media: [],
  'pl-tools': ['card', 'chat'],
  replay: ['room-archive'],
  'room-archive': [],
  'room-settings': ['room-archive', 'skin'],
  skin: [],
  'status-ailment': [],
  'streaming-overlay': [],
  tabletop: ['card', 'character', 'coin', 'dice', 'disclosure', 'effect', 'lobby', 'map-editor', 'replay'],
  'visual-novel': ['character', 'chat'],
  vote: [],
  widgets: [],
};

const FEATURE_RULES = Object.entries(FEATURE_DEPENDENCIES).map(([feature, allowed]) => ({
  files: [`src/app/features/${feature}/**/*.ts`],
  ignores: [`src/app/features/${feature}/**/*.spec.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          NO_RELATIVE_IMPORT,
          {
            regex: `^@axe/features/(?!(?:${[feature, 'panels', ...allowed].join('|')})/)`,
            message: `features/${feature} は他の feature を直接 import しない（panels か FEATURE_DEPENDENCIES に挙げた feature のみ）`,
          },
        ],
      },
    ],
  },
}));

export default defineConfig([
  {
    ignores: ['projects/**/*', 'website/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended, ...angular.configs.tsRecommended],
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/no-empty-lifecycle-method': 'off',
      '@angular-eslint/no-input-rename': 'off',
      '@angular-eslint/no-output-rename': 'off',
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipComments: true }],
      '@typescript-eslint/no-unused-vars': 'off',
      'no-restricted-imports': ['error', { patterns: [NO_RELATIVE_IMPORT] }],
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
    },
  },
  /* レイヤー境界ルール: 上位レイヤーへの逆流 import を禁止。
   * 末尾の config block が同じ rule を上書きするため、各レイヤー専用の
   * `no-restricted-imports` ブロックを追加して上書きする。 */
  {
    files: ['src/app/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_RELATIVE_IMPORT, FORBID_FOR_CORE] }],
    },
  },
  /* core 内 spec の例外
   *  **.spec.ts は domain インスタンスを使って統合テストする必要があるため、
   *  実装側より広めに import を許す。 */
  {
    files: ['src/app/core/**/*.spec.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [NO_RELATIVE_IMPORT] }] },
  },
  {
    files: ['src/app/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_RELATIVE_IMPORT, FORBID_FOR_DOMAIN] }],
    },
  },
  {
    files: ['src/app/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_RELATIVE_IMPORT, FORBID_FOR_INFRASTRUCTURE] }],
    },
  },
  {
    files: ['src/app/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_RELATIVE_IMPORT, FORBID_FOR_APPLICATION] }],
    },
  },
  {
    files: ['src/app/ui/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_RELATIVE_IMPORT, FORBID_FOR_UI] }],
    },
  },
  ...FEATURE_RULES,
  /* composition root: すべての層に依存可能（features を含む）。
   *  明示することで「ここはレイヤー制約から意図的に外している」と宣言する。 */
  {
    files: ['src/app/composition/**/*.ts', 'src/app/app.component.ts', 'src/main.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [NO_RELATIVE_IMPORT] }] },
  },
  /* spec / テスト用ユーティリティ内のテストホストコンポーネントは CD を明示制御するため
   *  OnPush を強制しない（angular-eslint v22 で追加されたルール）。 */
  {
    files: ['src/app/**/*.spec.ts', 'src/app/testing/**/*.ts'],
    rules: { '@angular-eslint/prefer-on-push-component-change-detection': 'off' },
  },
  {
    files: ['src/app/**/*.html'],
    extends: [...angular.configs.templateRecommended],
    rules: {},
  },
  /* eslint-plugin-better-tailwindcss: Tailwind class の canonical 変換 / 並び替え /
     重複削除 / 非推奨削除 / 不要空白整理を ng lint --fix で auto-fix できるようにする。
     prettier-plugin-tailwindcss が並び替えのみなのに対し、こちらは canonical class
     (gap-[6px] → gap-1.5, flex-shrink-0 → shrink-0 等) も含めて変換する。

     移行期間中の独自 CSS クラス (fab-nav / material-icons / am-root 等) に対する
     no-unknown-classes / no-conflicting-classes は移行完了まで無効化する。 */
  {
    files: ['src/app/**/*.ts', 'src/app/**/*.html'],
    plugins: { 'better-tailwindcss': betterTailwindcss },
    rules: {
      ...betterTailwindcss.configs.recommended.rules,
      'better-tailwindcss/no-unknown-classes': 'off',
      'better-tailwindcss/no-conflicting-classes': 'off',
      /* prettier-plugin-tailwindcss が 1 行整形・並び替えを担当するため、
         enforce-consistent-line-wrapping と enforce-consistent-class-order を off。
         両者を有効にすると prettier vs better-tailwindcss で互いに上書きし合う。 */
      'better-tailwindcss/enforce-consistent-line-wrapping': 'off',
      'better-tailwindcss/enforce-consistent-class-order': 'off',
    },
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/styles.css',
        /* rootFontSize: 16 を指定すると w-[300px] のような任意 px 値が
           Tailwind spacing scale (w-75 等) に canonical 変換される。
           index.html の <html> は browser default の 16px を継承するためこの値で正しい。 */
        rootFontSize: 16,
      },
    },
  },
  /* e2e/ ディレクトリ配下では相対インポートを許可する (e2e 用のパスエイリアスは
     未設定、かつ Playwright 設定が tsconfig 別ファイル参照のため src との切り分けが
     不要)。 */
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  prettierPlugin,
]);
