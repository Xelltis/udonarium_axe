import eslint from '@eslint/js';
import angular from 'angular-eslint';
import { defineConfig } from 'eslint/config';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import prettierPlugin from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

/* Layer boundary rules
 * Dependency direction (strict): features → ui → application → infrastructure → domain → core
 *                                                ↘──────────────────────────────↗ (application reads domain directly)
 * The composition root (src/app/composition/, src/app/app.component.ts and src/main.ts) may depend on
 *  every layer. Each feature keeps its own *-event-handler.service, which the root only injects.
 */
const NO_RELATIVE_IMPORT = {
  regex: '^\\.',
  message: '相対パスインポートは禁止です。パスエイリアス（@axe/...）を使用してください。',
};
const LAYER_MESSAGE = (forbidden: string) =>
  `[layer] ${forbidden}層への逆流importは禁止です。依存方向: features → ui → application → infrastructure → domain → core`;

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
  // application may call domain / core / infrastructure, but not ui / features.
  regex: '^@axe/(ui|features)/',
  message: LAYER_MESSAGE('ui/features'),
};
const FORBID_FOR_UI = {
  regex: '^@axe/features/',
  message: LAYER_MESSAGE('features'),
};

/* Imports between features are allowed only along the edges that exist now. A new edge is added here
   on purpose (the aim is not to add more). A lazy import() is an edge as much as a static one. */
const FEATURE_DEPENDENCIES: Record<string, readonly string[]> = {
  alarm: [],
  'battle-cut-in': ['effect'],
  buff: [],
  'button-guide': [],
  card: [],
  'ccfolia-room-import': [],
  character: ['card', 'data-element', 'disclosure', 'light-settings'],
  chat: ['alarm', 'data-element', 'vote'],
  coin: [],
  controller: ['character', 'chat'],
  'data-element': ['range-shape-editor'],
  dice: [],
  disclosure: [],
  'dungeon-generator': [],
  effect: [],
  file: ['moderation'],
  'first-person': ['effect', 'tabletop'],
  'gpu-notice': [],
  'gm-object-list': ['character', 'disclosure', 'light-settings'],
  'gm-tools': ['chat', 'menu'],
  hotbar: ['effect', 'menu'],
  inventory: ['tabletop'],
  keyboard: [],
  'light-settings': [],
  lobby: ['moderation', 'room-archive'],
  'map-editor': ['tabletop'],
  mobile: ['chat'],
  panels: [],
  menu: [],
  media: ['moderation'],
  moderation: [],
  'pl-tools': ['menu'],
  'range-shape-editor': [],
  replay: [],
  'room-archive': [],
  'room-settings': ['room-archive', 'skin'],
  skin: [],
  'sound-settings': [],
  'status-ailment': [],
  'streaming-overlay': [],
  tabletop: [
    'card',
    'character',
    'coin',
    'dice',
    'disclosure',
    'effect',
    'light-settings',
    'lobby',
    'range-shape-editor',
    'replay',
  ],
  'visual-novel': ['character', 'chat'],
  vote: [],
  widgets: [],
};

/* Angular builds the services, components, directives and pipes, so they take the app's singletons
   through inject() (bridged in composition/class-provider.ts) rather than reading them off the class.
   The synced singletons (Config, ChatTabList, DataSummarySetting, TurnState) are left out on purpose:
   their `instance` answers for whichever object stands in the room at the time, which an injected
   copy would not follow. */
const PROCESS_SINGLETONS = [
  'AssetHttpStore',
  'AudioSharingSystem',
  'AudioStorage',
  'FileArchiver',
  'ImageSharingSystem',
  'ImageStorage',
  'ObjectFactory',
  'ObjectSerializer',
  'ObjectStore',
  'ObjectSynchronizer',
  'VideoEncoderGateway',
];

/* The ledger may not run in a circle: two features that each import the other are one feature in two
   folders, and what they share belongs a layer down. Loading this config fails while one does. */
function assertNoCycle(dependencies: Record<string, readonly string[]>): void {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (feature: string, path: readonly string[]): void => {
    if (done.has(feature)) return;
    if (visiting.has(feature)) {
      throw new Error(`FEATURE_DEPENDENCIES runs in a circle: ${[...path, feature].join(' -> ')}`);
    }
    visiting.add(feature);
    for (const next of dependencies[feature] ?? []) visit(next, [...path, feature]);
    visiting.delete(feature);
    done.add(feature);
  };
  for (const feature of Object.keys(dependencies)) visit(feature, []);
}
assertNoCycle(FEATURE_DEPENDENCIES);

const NO_SINGLETON_INSTANCE = {
  selector: `MemberExpression[object.name=/^(${PROCESS_SINGLETONS.join('|')})$/][property.name='instance']`,
  message:
    'Angularが作るクラスでは`.instance`を読まず`inject()`で受け取る（composition/class-provider.tsで橋渡し済み）',
};
const ANGULAR_CLASS_FILES = '*.{service,component,directive,pipe}.ts';

/* no-restricted-imports does not look at import(), so a lazy import outside the ledger is caught by
   its source instead (`\x2F` is a slash, which an esquery regex may not hold). panels opens every
   feature's panel lazily by design, and is left out of this. A later block overrides the same rule,
   so the Angular-built classes of a feature get both selectors in one block. */
const FEATURE_RULES = Object.entries(FEATURE_DEPENDENCIES).flatMap(([feature, allowed]) => {
  const reachable = [feature, 'panels', ...allowed].join('|');
  const lazyImports =
    feature === 'panels'
      ? []
      : [
          {
            selector: `ImportExpression[source.value=/^@axe\\x2Ffeatures\\x2F(?!(?:${reachable})\\x2F)/]`,
            message: `features/${feature}は他のfeatureを遅延importでも直接importしない（panelsかFEATURE_DEPENDENCIESに挙げたfeatureのみ）`,
          },
        ];
  return [
    {
      files: [`src/app/features/${feature}/**/*.ts`],
      ignores: [`src/app/features/${feature}/**/*.spec.ts`],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              NO_RELATIVE_IMPORT,
              {
                regex: `^@axe/features/(?!(?:${reachable})/)`,
                message: `features/${feature}は他のfeatureを直接importしない（panelsかFEATURE_DEPENDENCIESに挙げたfeatureのみ）`,
              },
            ],
          },
        ],
        'no-restricted-syntax': ['error', ...lazyImports],
      },
    },
    {
      files: [`src/app/features/${feature}/**/${ANGULAR_CLASS_FILES}`],
      ignores: [`src/app/features/${feature}/**/*.spec.ts`],
      rules: { 'no-restricted-syntax': ['error', ...lazyImports, NO_SINGLETON_INSTANCE] },
    },
  ];
});

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
  /* Layer boundary rules: imports flowing back up to a higher layer are forbidden.
   * A config block placed later overrides the same rule, so each layer gets a
   * `no-restricted-imports` block of its own, added to override it. */
  {
    files: ['src/app/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_RELATIVE_IMPORT, FORBID_FOR_CORE] }],
    },
  },
  /* The exception for specs inside core
   *  **.spec.ts files need domain instances for their integration tests, so they are allowed
   *  wider imports than the implementation. */
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
  {
    files: [`src/app/{application,ui}/**/${ANGULAR_CLASS_FILES}`],
    ignores: ['src/app/**/*.spec.ts'],
    rules: { 'no-restricted-syntax': ['error', NO_SINGLETON_INSTANCE] },
  },
  ...FEATURE_RULES,
  /* composition root: may depend on every layer (features included).
   *  Spelling it out declares that this is left outside the layer constraints on purpose. */
  {
    files: ['src/app/composition/**/*.ts', 'src/app/app.component.ts', 'src/main.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [NO_RELATIVE_IMPORT] }] },
  },
  /* Test host components in specs and test utilities control change detection explicitly, so
   *  OnPush is not enforced on them (a rule added in angular-eslint v22). */
  {
    files: ['src/app/**/*.spec.ts', 'src/app/testing/**/*.ts'],
    rules: { '@angular-eslint/prefer-on-push-component-change-detection': 'off' },
  },
  /* A module mocked with vi.mock does nothing under `ng test`, which bundles the specs, and under
   *  `npx vitest run`, whose workers run file after file without isolating them, a module that
   *  imported the mock goes on holding it for the files after. Specs stand in for what they need
   *  with vi.spyOn and the seams the code gives instead. */
  {
    files: ['src/app/**/*.spec.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'vi', property: 'mock', message: 'Stand in with vi.spyOn or a seam; vi.mock leaks between files.' },
        {
          object: 'vi',
          property: 'doMock',
          message: 'Stand in with vi.spyOn or a seam; vi.doMock leaks between files.',
        },
      ],
    },
  },
  {
    files: ['src/app/**/*.html'],
    extends: [...angular.configs.templateRecommended],
    rules: {},
  },
  /* eslint-plugin-better-tailwindcss: lets ng lint --fix put Tailwind classes into canonical form, sort
     them, and remove duplicates, deprecated classes and needless whitespace on its own.
     prettier-plugin-tailwindcss only sorts, while this also converts to canonical classes
     (gap-[6px] → gap-1.5, flex-shrink-0 → shrink-0 and the like).

     no-unknown-classes / no-conflicting-classes, which would flag the custom CSS classes kept while the
     migration lasts (fab-nav / material-icons / am-root and the like), stay off until it is done. */
  {
    files: ['src/app/**/*.ts', 'src/app/**/*.html'],
    plugins: { 'better-tailwindcss': betterTailwindcss },
    rules: {
      ...betterTailwindcss.configs.recommended.rules,
      'better-tailwindcss/no-unknown-classes': 'off',
      'better-tailwindcss/no-conflicting-classes': 'off',
      /* prettier-plugin-tailwindcss takes care of one-line formatting and sorting, so
         enforce-consistent-line-wrapping and enforce-consistent-class-order are off.
         With both on, prettier and better-tailwindcss keep overwriting each other. */
      'better-tailwindcss/enforce-consistent-line-wrapping': 'off',
      'better-tailwindcss/enforce-consistent-class-order': 'off',
    },
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/styles.css',
        /* With rootFontSize: 16, arbitrary px values such as w-[300px] are converted
           to the canonical Tailwind spacing scale (w-75 and the like).
           The <html> in index.html inherits the browser's default 16px, so this value is right. */
        rootFontSize: 16,
      },
    },
  },
  /* Relative imports are allowed under the e2e/ directory (e2e has no path aliases set up, and the
     Playwright config refers to a tsconfig of its own, so there is no need to keep it apart from
     src). */
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  prettierPlugin,
]);
