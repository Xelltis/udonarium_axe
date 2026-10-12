/**
 * One row of the table a room writes for how big an engagement zone grows: up to `upTo` counted
 * bodies, the zone is a circle of `radiusM` metres, or a square `sideM` metres across.
 */
export interface ZoneSizeRow {
  readonly upTo: number;
  readonly radiusM: number;
  readonly sideM: number;
}

/** How a room plays engagement zones. */
export interface ZoneRules {
  readonly enabled: boolean;
  /** The sizes by count, smallest first; the last row's count is the most a zone holds. */
  readonly sizes: readonly ZoneSizeRow[];
  /** The sheet field a piece gives its count in, where a piece counts as more than one; empty counts each piece once. */
  readonly countField: string;
  /** How close two pieces stand, in metres, to be at the same point. */
  readonly samePointM: number;
  /** How many times the other side's number one side has to be to walk past a zone, or out of it, unheld. */
  readonly outnumber: number;
  /** The kind of move a piece may leave an overflowing zone by at once, or empty for any kind. */
  readonly leaveKind: string;
  /** How close to a line of fire, in metres, a piece out of every zone stands to stand in its way. */
  readonly blockRadiusM: number;
  /** The sheet field or buff by which a shooter fires past what stands in the way, empty for none. */
  readonly clearName: string;
}

/** The sizes a room has before it writes its own: a zone grows a metre for every four bodies. */
export const DEFAULT_ZONE_SIZES = '4:2:3,8:3:5,12:4:7,16:5:9,20:6:11';

export const DEFAULT_ZONE_SAME_POINT_M = 1;

export const DEFAULT_ZONE_OUTNUMBER = 2;

export const DEFAULT_ZONE_BLOCK_RADIUS_M = 0.5;

export const DEFAULT_ZONE_RULES: ZoneRules = {
  enabled: false,
  sizes: parseZoneSizes(DEFAULT_ZONE_SIZES),
  countField: '',
  samePointM: DEFAULT_ZONE_SAME_POINT_M,
  outnumber: DEFAULT_ZONE_OUTNUMBER,
  leaveKind: '',
  blockRadiusM: DEFAULT_ZONE_BLOCK_RADIUS_M,
  clearName: '',
};

/** What a room writes for its zones, each null where it has written nothing. */
export interface ZoneRuleAnswers {
  readonly enabled: boolean | null;
  readonly sizes: string | null;
  readonly countField: string | null;
  readonly samePointM: number | null;
  readonly outnumber?: number | null;
  readonly leaveKind?: string | null;
  readonly blockRadiusM?: number | null;
  readonly clearName?: string | null;
}

/** The rules a room plays, its own answers first and the defaults for whatever it has left unwritten. */
export function resolveZoneRules(answers: Partial<ZoneRuleAnswers> | null): ZoneRules {
  const sizes = answers?.sizes != null ? parseZoneSizes(answers.sizes) : [];
  const samePointM = answers?.samePointM;
  const outnumber = answers?.outnumber;
  const blockRadiusM = answers?.blockRadiusM;
  return {
    enabled: answers?.enabled ?? DEFAULT_ZONE_RULES.enabled,
    sizes: sizes.length > 0 ? sizes : DEFAULT_ZONE_RULES.sizes,
    countField: (answers?.countField ?? DEFAULT_ZONE_RULES.countField).trim(),
    samePointM: samePointM != null && samePointM >= 0 ? samePointM : DEFAULT_ZONE_RULES.samePointM,
    outnumber: outnumber != null && outnumber > 0 ? outnumber : DEFAULT_ZONE_RULES.outnumber,
    leaveKind: (answers?.leaveKind ?? DEFAULT_ZONE_RULES.leaveKind).trim(),
    blockRadiusM: blockRadiusM != null && blockRadiusM >= 0 ? blockRadiusM : DEFAULT_ZONE_RULES.blockRadiusM,
    clearName: (answers?.clearName ?? DEFAULT_ZONE_RULES.clearName).trim(),
  };
}

/**
 * Reads a size table written as `count:radius:side` rows separated by commas, smallest count first.
 *
 * A row it cannot read, a size that is not a positive number, and a row that does not count higher
 * than the one before it are left out; nothing readable at all gives an empty table, which the
 * rules answer with their own.
 */
export function parseZoneSizes(text: string): ZoneSizeRow[] {
  const rows: ZoneSizeRow[] = [];
  for (const written of text.split(/[,、\n]/)) {
    const parts = written.split(/[:：]/).map((part) => Number(part.trim()));
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part) || part <= 0)) continue;
    const [upTo, radiusM, sideM] = parts;
    if (!Number.isInteger(upTo)) continue;
    if (rows.length > 0 && upTo <= rows[rows.length - 1].upTo) continue;
    rows.push({ upTo, radiusM, sideM });
  }
  return rows;
}

/** The size of a zone holding `count` bodies; past the last row, the last row's size. */
export function zoneSizeFor(sizes: readonly ZoneSizeRow[], count: number): ZoneSizeRow {
  return sizes.find((row) => count <= row.upTo) ?? sizes[sizes.length - 1];
}

/** The most bodies a zone may hold by the table, which is the last row's count. */
export function zoneLimitOf(sizes: readonly ZoneSizeRow[]): number {
  return sizes[sizes.length - 1].upTo;
}
