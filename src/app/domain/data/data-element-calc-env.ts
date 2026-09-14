import { DataElement, DataElementAttribute, DataElementFieldType } from '@axe/domain/data/data-element';
import { type CalcEnv, type CalcLookup, evalCalcFormula } from '@axe/domain/data/data-element-calc';

/**
 * What one round of working out already knows.
 *
 * A sheet is full of fields that read each other, and a field reads its sheet by name. Worked
 * out from scratch each time, one field would settle every other field on the sheet, and each
 * of those would settle every other field again — so a sheet cost more with each field added
 * to it rather than a little more. A pass holds the shape of each sheet it has looked at and
 * the value of each field it has settled, so each is settled once.
 *
 * Hand the same pass to every field being shown at once and the sheet is read once for all of
 * them. Leave it out and each call gets a pass of its own, which is still cheap.
 */
export interface CalcPass {
  readonly scopes: Map<DataElement, ScopeIndex>;
  readonly values: Map<string, number | null>;
  readonly working: Set<string>;
}

interface ScopeLeaf {
  readonly node: DataElement;
  readonly name: string;
  readonly path: string;
}

interface ScopeIndex {
  readonly leaves: readonly ScopeLeaf[];
  /** Every field by its full path, folded to lower case. */
  readonly byPath: ReadonlyMap<string, DataElement>;
  /**
   * Every field answering to a bare name, folded to lower case, kept as a list rather than
   * as one field. A name several fields answer to stands for the one of them holding a
   * number, and which that is cannot be told from the shape of the sheet alone.
   */
  readonly byName: ReadonlyMap<string, readonly DataElement[]>;
}

/** A fresh, empty pass, to be shared by every calculating field worked out for one render of a sheet. */
export function createCalcPass(): CalcPass {
  return { scopes: new Map(), values: new Map(), working: new Set() };
}

/** Every name the sheet offers a formula, with what each stands for. */
export function buildCalcEnv(self: DataElement, pass: CalcPass = createCalcPass()): CalcEnv {
  const root = DataElement.getDetailNameScope(self);
  const index = scopeIndex(root, pass);

  const env: CalcEnv = {};
  for (const leaf of index.leaves) {
    const value = resolve(leaf.node, pass);
    if (value == null || Number.isNaN(value)) continue;
    env[leaf.path] = value;
    if (soleNumbered(index.byName.get(leaf.name.toLowerCase()), pass) === leaf.node) env[leaf.name] = value;
  }
  return env;
}

/**
 * The worked-out value of a calculating field, as text.
 *
 * A field of this kind keeps its formula rather than its result, so its stored value is empty.
 * Anything showing it — the sheet, a popup, a line of chat — asks here instead.
 */
export function evaluateCalcElement(element: DataElement, pass: CalcPass = createCalcPass()): string {
  const result = resolve(element, pass);
  if (result == null) return '';
  return Number.isNaN(result) ? '?' : String(result % 1 === 0 ? result : parseFloat(result.toFixed(4)));
}

/**
 * Everything the result is worked out from, so a screen showing it can watch them all.
 * A field reads the whole of the sheet it belongs to, not only what its formula names.
 */
export function calcSourceIdentifiers(element: DataElement): string[] {
  const root = DataElement.getDetailNameScope(element);
  const identifiers: string[] = [];
  const collect = (node: DataElement): void => {
    identifiers.push(node.identifier);
    for (const child of node.children) collect(child);
  };
  collect(root);
  return identifiers;
}

/** The value of one field, settled once and remembered for the rest of the pass. */
function resolve(node: DataElement, pass: CalcPass): number | null {
  const settled = pass.values.get(node.identifier);
  if (settled !== undefined) return settled;

  if (node.fieldType !== DataElementFieldType.CALC) {
    // A resource stands at its current value; its stored value is only the top of the bar.
    const value = Number(node.isNumberResource ? node.currentValue : node.value);
    pass.values.set(node.identifier, value);
    return value;
  }

  // A field naming itself, however far round, would work itself out for ever. While one is
  // being worked out it counts as no number at all, which is what breaks the ring. Only a
  // field that truly names its way back here can reach this, because a formula is only ever
  // asked for the names it actually uses.
  if (pass.working.has(node.identifier)) return null;

  const formula = node.getAttribute(DataElementAttribute.FORMULA);
  if (!formula) {
    pass.values.set(node.identifier, null);
    return null;
  }

  pass.working.add(node.identifier);
  let value: number;
  try {
    value = evalCalcFormula(formula, lookupWithin(node, pass));
  } finally {
    pass.working.delete(node.identifier);
  }
  pass.values.set(node.identifier, value);
  return value;
}

/** What the sheet answers to a name, worked out only for the names actually asked about. */
function lookupWithin(self: DataElement, pass: CalcPass): CalcLookup {
  const index = scopeIndex(DataElement.getDetailNameScope(self), pass);
  return (name) => {
    const node = index.byPath.get(name) ?? soleNumbered(index.byName.get(name), pass);
    if (!node) return NaN;
    const value = resolve(node, pass);
    return value == null ? NaN : value;
  };
}

/**
 * The one field of those sharing a name that a formula may mean.
 *
 * A name two fields answer to means neither of them. A field holding words rather than a
 * number is not one of the two: a sheet with a note called HP beside the number called HP
 * still adds up.
 */
function soleNumbered(nodes: readonly DataElement[] | undefined, pass: CalcPass): DataElement | null {
  if (!nodes) return null;
  if (nodes.length === 1) return nodes[0];

  let found: DataElement | null = null;
  for (const node of nodes) {
    const value = resolve(node, pass);
    if (value == null || Number.isNaN(value)) continue;
    if (found) return null;
    found = node;
  }
  return found;
}

/**
 * Where every leaf of a sheet sits and what it may be called. This is the shape of the sheet
 * rather than its contents, so it is worked out once however many fields read it.
 */
function scopeIndex(root: DataElement, pass: CalcPass): ScopeIndex {
  const known = pass.scopes.get(root);
  if (known) return known;

  const leaves: ScopeLeaf[] = [];
  collectLeaves(root, root, leaves);

  const byPath = new Map<string, DataElement>();
  for (const leaf of leaves) byPath.set(leaf.path.toLowerCase(), leaf.node);

  const byName = new Map<string, DataElement[]>();
  for (const leaf of leaves) {
    // A full path is the surer name of the two, so it keeps whatever it already stands for.
    const folded = leaf.name.toLowerCase();
    if (byPath.has(folded)) continue;
    const sharing = byName.get(folded);
    if (sharing) sharing.push(leaf.node);
    else byName.set(folded, [leaf.node]);
  }

  const index: ScopeIndex = { leaves, byPath, byName };
  pass.scopes.set(root, index);
  return index;
}

function collectLeaves(node: DataElement, root: DataElement, leaves: ScopeLeaf[]): void {
  if (!node.children.length) {
    if (node.name) leaves.push({ node, name: node.name, path: DataElement.formatReferencePath(node, root) });
    return;
  }
  for (const child of node.children) collectLeaves(child, root, leaves);
}
