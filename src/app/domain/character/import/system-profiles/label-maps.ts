type LabelMaps = Record<string, Record<string, string>>;

const NO_LABELS: Record<string, string> = {};
let charasheet: LabelMaps = {};
let appspot: LabelMaps = {};
let loading: Promise<void> | null = null;

/**
 * Loads the generated heading tables for the archive and the warehouse, once; later calls share the
 * same promise.
 *
 * The tables are large and only wanted when importing, so they load apart from the main bundle.
 * Until this resolves, every lookup answers with no headings.
 */
export function loadLabelMaps(): Promise<void> {
  loading ??= Promise.all([
    import('@axe/domain/character/import/charasheet-label-maps.generated'),
    import('@axe/domain/character/import/appspot-label-maps.generated'),
  ]).then(([sheet, warehouse]) => {
    charasheet = sheet.CHARASHEET_LABEL_MAPS;
    appspot = warehouse.APPSPOT_LABEL_MAPS;
  });
  return loading;
}

/**
 * The headings for an archive system token, keyed by input name. Empty for an unknown token or
 * before `loadLabelMaps` has finished.
 */
export function charasheetLabelMap(game: string): Record<string, string> {
  return charasheet[game] ?? NO_LABELS;
}

/**
 * The headings for a warehouse system slug, keyed by json path. Empty for an unknown slug or before
 * `loadLabelMaps` has finished.
 */
export function appspotLabelMap(slug: string): Record<string, string> {
  return appspot[slug] ?? NO_LABELS;
}
