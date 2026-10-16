// Generates the import table that loads BCDice's game systems and translations from chunks holding a few
// of them each. The DynamicLoader bundled with bcdice hands require a path built at run time, which the
// bundler cannot follow, so it fails in the browser. Reading every system together comes to over 11MB, and
// splitting them one system apiece makes over 400 files (the Cloudflare Pages dashboard takes uploads of
// up to 1,000 files).
// So the systems are split into families gathered under the root of their inheritance (Cthulhu and
// Cthulhu_Korean, SwordWorld and SwordWorld2_5, and so on), packed in name order about 300KB at a time
// without splitting a family, and each group becomes one chunk. Families are kept whole because a derived
// system that reads its parent from another chunk turns that parent into one more file, as a shared chunk.
// A system reads its translations when it defines its class, so a group's translations go into a separate,
// small chunk, which is always read and handed to BCDice before the system chunk is read. Putting them in
// the same chunk and leaving it to the import order does not work: the bundler may evaluate the CommonJS
// systems first, so the order cannot be guaranteed.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import * as prettier from 'prettier';

const GAME_SYSTEM_LIST_PATH = 'node_modules/bcdice/lib/bcdice/game_system_list.json';
const GAME_SYSTEM_DIR = 'node_modules/bcdice/lib/bcdice/game_system';
const I18N_LIST_PATH = 'node_modules/bcdice/lib/bcdice/i18n_list.json';
const I18N_DIR = 'node_modules/bcdice/lib/bcdice/i18n';
const OUTPUT_PATH = 'src/app/domain/dice/bcdice/bcdice-importers.generated.ts';
const GROUP_DIR = 'src/app/domain/dice/bcdice/groups';
const GROUP_ALIAS = '@axe/domain/dice/bcdice/groups';
const TRANSLATION_LOADER = '@axe/domain/dice/bcdice/bcdice-translations';

/** About how much to pack into one group, in bytes of the original JS and JSON. A family over this stands alone. */
const GROUP_BYTES = 300_000;

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const { gameSystems } = JSON.parse(readFileSync(GAME_SYSTEM_LIST_PATH, 'utf-8'));
const superClassOf = new Map(gameSystems.map(({ className, superClassName }) => [className, superClassName]));
const classNames = [...superClassOf.keys()]
  .filter((className) => {
    if (existsSync(`${GAME_SYSTEM_DIR}/${className}.js`)) return true;
    console.warn(`[generate-bcdice-importers] 見つかりません: ${className}.js`);
    return false;
  })
  .sort(collator.compare);

/** The class name at the root of the inheritance chain. A name that is not a system comes back as it is. */
const familyOf = (className) => {
  let current = className;
  const seen = new Set();
  while (superClassOf.has(superClassOf.get(current)) && !seen.has(current)) {
    seen.add(current);
    current = superClassOf.get(current);
  }
  return current;
};

const { i18nList } = JSON.parse(readFileSync(I18N_LIST_PATH, 'utf-8'));
const translations = [];
for (const { baseClassName, locales } of i18nList) {
  for (const locale of locales) {
    const fileName = `${baseClassName}.${locale}.json`;
    if (!existsSync(`${I18N_DIR}/${fileName}`)) {
      console.warn(`[generate-bcdice-importers] 見つかりません: ${fileName}`);
      continue;
    }
    translations.push({ key: `${baseClassName}.${locale}`, fileName, baseClassName });
  }
}
translations.sort((a, b) => collator.compare(a.fileName, b.fileName));

const families = new Map();
const addToFamily = (family, item) => families.set(family, [...(families.get(family) ?? []), item]);
for (const className of classNames) {
  addToFamily(familyOf(className), {
    kind: 'system',
    key: className,
    bytes: statSync(`${GAME_SYSTEM_DIR}/${className}.js`).size,
    from: `bcdice/lib/bcdice/game_system/${className}`,
  });
}
for (const { key, fileName, baseClassName } of translations) {
  addToFamily(familyOf(baseClassName), {
    kind: 'translation',
    key,
    bytes: statSync(`${I18N_DIR}/${fileName}`).size,
    from: `bcdice/lib/bcdice/i18n/${fileName}`,
  });
}

const groups = [];
let members = [];
let bytes = 0;
const close = () => {
  if (members.length === 0) return;
  groups.push({ name: `bcdice-${String(groups.length + 1).padStart(2, '0')}`, members });
  members = [];
  bytes = 0;
};
for (const family of [...families.keys()].sort(collator.compare)) {
  const familyItems = families.get(family);
  const familyBytes = familyItems.reduce((sum, item) => sum + item.bytes, 0);
  if (bytes + familyBytes > GROUP_BYTES) close();
  members.push(...familyItems);
  bytes += familyBytes;
}
close();

const prettierConfig = await prettier.resolveConfig(OUTPUT_PATH);
const write = async (path, source) =>
  writeFileSync(path, await prettier.format(source, { ...prettierConfig, filepath: path }));

const identifierOf = (item) =>
  item.kind === 'system' ? `system_${item.key}` : `translation_${item.key.replace(/\./g, '_')}`;
const HEADER = '// generated by scripts/generate-bcdice-importers.mjs — do not edit';

rmSync(GROUP_DIR, { recursive: true, force: true });
mkdirSync(GROUP_DIR, { recursive: true });
for (const { name, members: groupMembers } of groups) {
  const systems = groupMembers
    .filter((item) => item.kind === 'system')
    .sort((a, b) => collator.compare(a.from, b.from));
  const texts = groupMembers
    .filter((item) => item.kind === 'translation')
    .sort((a, b) => collator.compare(a.from, b.from));

  if (texts.length > 0) {
    await write(
      `${GROUP_DIR}/${name}-translations.generated.ts`,
      `${HEADER}

import { loadBCDiceTranslations } from '${TRANSLATION_LOADER}';
${texts.map((item) => `import ${identifierOf(item)} from '${item.from}';`).join('\n')}

/** The translations of the game systems in this chunk, by \`\${baseClassName}.\${locale}\`. */
export const TRANSLATIONS: Readonly<Record<string, unknown>> = {
${texts.map((item) => `  '${item.key}': ${identifierOf(item)},`).join('\n')}
};

loadBCDiceTranslations(TRANSLATIONS);
`
    );
  }

  await write(
    `${GROUP_DIR}/${name}.generated.ts`,
    `${HEADER}

${systems.map((item) => `import * as ${identifierOf(item)} from '${item.from}';`).join('\n')}

/**
 * The game systems this chunk registers with BCDice as it is evaluated. Their translations are in
 * a chunk of their own, which the importers load first.
 */
export const GAME_SYSTEMS: readonly unknown[] = [${systems.map(identifierOf).join(', ')}];
`
  );
}

const loaderOf = (group) => group.name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const translationsLoaderOf = (group) => `${loaderOf(group)}Translations`;
const hasTranslations = (group) => group.members.some((item) => item.kind === 'translation');
const groupOf = new Map(groups.flatMap((group) => group.members.map((item) => [`${item.kind}:${item.key}`, group])));

const loaders = groups
  .map((group) => {
    const systems = `import('${GROUP_ALIAS}/${group.name}.generated')`;
    if (!hasTranslations(group)) return `const ${loaderOf(group)} = () => ${systems};`;
    return [
      `const ${translationsLoaderOf(group)} = () => import('${GROUP_ALIAS}/${group.name}-translations.generated');`,
      `const ${loaderOf(group)} = () => ${translationsLoaderOf(group)}().then(() => ${systems});`,
    ].join('\n');
  })
  .join('\n');

await write(
  OUTPUT_PATH,
  `${HEADER}

// A chunk of game systems is loaded only after the chunk of their translations, which hands them to
// BCDice as it is evaluated: the systems read them as their classes are defined.
${loaders}

/** Loads the chunk that registers one game system with BCDice, by the name of its class. */
export const BCDICE_GAME_SYSTEM_IMPORTERS: Readonly<Record<string, () => Promise<unknown>>> = {
${classNames.map((className) => `  ${className}: ${loaderOf(groupOf.get(`system:${className}`))},`).join('\n')}
};

/** Loads one translation from the chunk that carries it, by \`\${baseClassName}.\${locale}\`. */
export const BCDICE_I18N_IMPORTERS: Readonly<Record<string, () => Promise<unknown>>> = {
${translations
  .map(
    ({ key }) =>
      `  '${key}': () => ${translationsLoaderOf(groupOf.get(`translation:${key}`))}().then((chunk) => chunk.TRANSLATIONS['${key}']),`
  )
  .join('\n')}
};
`
);

console.log(
  `[generate-bcdice-importers] システム${classNames.length}件と翻訳${translations.length}件を${groups.length}個のまとまりにして${OUTPUT_PATH}に出力しました`
);
