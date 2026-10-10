import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementType,
  DataElementViewMode,
} from '@axe/domain/data/data-element';

export type TextToken = { kind: 'text'; text: string };
export type CheckToken = { kind: 'check'; checked: boolean; idx: number };
export type Token = TextToken | CheckToken;

export type TableCell = Token[];
export type TableRow = { cells: TableCell[] };
export type TableBlock = { kind: 'table'; rows: TableRow[] };
export type PlainBlock = { kind: 'plain'; tokens: Token[] };
export type Block = TableBlock | PlainBlock;

const CHECK_RE = /[[［]([xXｘＸ]?)[\]］]/g;

function tokenizeLine(text: string, startIdx: number): { tokens: Token[]; nextIdx: number } {
  const tokens: Token[] = [];
  let idx = startIdx;
  let last = 0;
  let match: RegExpExecArray | null;
  CHECK_RE.lastIndex = 0;
  while ((match = CHECK_RE.exec(text)) !== null) {
    if (match.index > last) tokens.push({ kind: 'text', text: text.slice(last, match.index) });
    tokens.push({ kind: 'check', checked: match[1].length > 0, idx: idx++ });
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) });
  return { tokens, nextIdx: idx };
}

/**
 * Splits check-table text into table blocks (lines with `|` separators) and plain lines, with each `[ ]` or
 * `[x]` box turned into a check token.
 *
 * Boxes are numbered across the whole text in reading order, so a token's index is the one
 * {@link toggleCheckbox} takes. Full-width brackets, bars and x count the same as their ASCII forms.
 */
export function parseCheckTable(raw: string): Block[] {
  const lines = raw.split('\n');
  const blocks: Block[] = [];
  let tableRows: TableRow[] = [];
  let checkIdx = 0;

  const flushTable = () => {
    if (tableRows.length) {
      blocks.push({ kind: 'table', rows: tableRows });
      tableRows = [];
    }
  };

  for (const line of lines) {
    const parts = line.split(/[|｜]/);
    if (parts.length > 1) {
      const cells: TableCell[] = [];
      for (const part of parts.slice(1, -1)) {
        const { tokens, nextIdx } = tokenizeLine(part, checkIdx);
        checkIdx = nextIdx;
        cells.push(tokens);
      }
      tableRows.push({ cells });
    } else {
      flushTable();
      const { tokens, nextIdx } = tokenizeLine(line, checkIdx);
      checkIdx = nextIdx;
      blocks.push({ kind: 'plain', tokens });
    }
  }
  flushTable();
  return blocks;
}

/**
 * Flips the check box at the given reading-order index and returns the rewritten text.
 *
 * The box is written back in ASCII as `[]` or `[x]` whatever form it had; an index past the last box leaves
 * the text unchanged.
 */
export function toggleCheckbox(raw: string, targetIdx: number): string {
  let idx = 0;
  return raw.replace(/[[［]([xXｘＸ]?)[\]］]/g, (match, inner) => {
    const current = idx++;
    if (current !== targetIdx) return match;
    return inner.length > 0 ? '[]' : '[x]';
  });
}

/**
 * Builds a table-view section from check-table text, with one group per row and a check or text field per
 * cell.
 *
 * A header row names the columns, and an empty last header cell turns that column into row names. Each plain
 * line becomes a row of its own. Text with nothing in it still yields a single empty row so the table can be
 * edited.
 */
export function createStructuredCheckTableElement(name: string, raw: string): DataElement {
  const tableElement = DataElement.create(name, '', {
    [DataElementAttribute.ROLE]: DataElementRole.SECTION,
    [DataElementAttribute.VIEW_MODE]: DataElementViewMode.TABLE,
  });
  let rowIndex = 1;

  for (const block of parseCheckTable(raw)) {
    if (block.kind === 'table') {
      rowIndex = appendStructuredTableBlock(tableElement, block, rowIndex);
    } else {
      rowIndex = appendStructuredPlainBlock(tableElement, block, rowIndex, raw);
    }
  }

  if (tableElement.children.length < 1) {
    const row = createRowElement('行1');
    row.appendChild(createTextField('内容', ''));
    tableElement.appendChild(row);
  }
  return tableElement;
}

/** Whether an element is an old single-field check table or markdown note that can become a structured table. */
export function isLegacyCheckTableElement(element: DataElement): boolean {
  if (element.children.length > 0) return false;
  return (
    element.type === DataElementType.CHECK_TABLE ||
    element.type === DataElementType.MARKDOWN ||
    element.fieldType === DataElementFieldType.CHECK_TABLE ||
    element.fieldType === DataElementFieldType.MARKDOWN
  );
}

/** How many legacy check tables anywhere under a sheet's detail element would be converted, without changing it. */
export function countConvertibleCheckTableElements(detailElement: DataElement): number {
  const targets: DataElement[] = [];
  collectConvertibleCheckTableElements(detailElement.children, targets);
  return targets.length;
}

/**
 * Replaces every legacy check table under a sheet's detail element with a structured table and returns how
 * many were replaced.
 *
 * A table directly under the detail element or inside a section takes the old field's place; one nested
 * deeper is placed after its top-level ancestor, keeping several from the same ancestor in order. The old
 * elements are destroyed, which syncs to the other peers.
 */
export function convertLegacyCheckTableElements(detailElement: DataElement): number {
  const targets: DataElement[] = [];
  collectConvertibleCheckTableElements(detailElement.children, targets);
  const insertionAnchors = new Map<string, DataElement>();

  for (const target of targets) {
    replaceWithStructuredTable(detailElement, target, insertionAnchors);
  }

  if (targets.length > 0) detailElement.update();
  return targets.length;
}

function collectConvertibleCheckTableElements(elements: readonly DataElement[], targets: DataElement[]): void {
  for (const element of elements) {
    if (isLegacyCheckTableElement(element)) targets.push(element);
    if (element.children.length > 0) collectConvertibleCheckTableElements(element.children, targets);
  }
}

function replaceWithStructuredTable(
  detailElement: DataElement,
  target: DataElement,
  insertionAnchors: Map<string, DataElement>
): void {
  const structuredTable = createStructuredCheckTableElement(target.name, String(target.value));
  structuredTable.setAttribute('cs-icon', 'table_chart');
  const parent = target.parent instanceof DataElement ? target.parent : null;

  if (parent?.name === 'detail') {
    detailElement.insertBefore(structuredTable, target);
    target.destroy();
    return;
  }

  if (parent?.fieldRole === DataElementRole.SECTION) {
    structuredTable.setFieldRole(DataElementRole.GROUP);
    parent.insertBefore(structuredTable, target);
    target.destroy();
    parent.update();
    return;
  }

  const topLevelElement = findTopLevelDetailElement(target, detailElement);
  const anchorKey = topLevelElement?.identifier ?? detailElement.identifier;
  const anchor = insertionAnchors.get(anchorKey) ?? topLevelElement;

  if (anchor) insertElementAfter(structuredTable, anchor, detailElement);
  else detailElement.appendChild(structuredTable);
  insertionAnchors.set(anchorKey, structuredTable);
  target.destroy();
}

function findTopLevelDetailElement(element: DataElement, detailElement: DataElement): DataElement | null {
  let current: DataElement = element;
  let parent = current.parent;

  while (parent instanceof DataElement && parent !== detailElement) {
    current = parent;
    parent = current.parent;
  }

  return parent === detailElement ? current : null;
}

function insertElementAfter(element: DataElement, targetElement: DataElement, parentElement: DataElement): void {
  const targetIndex = parentElement.children.indexOf(targetElement);
  const nextElement = parentElement.children[targetIndex + 1];
  if (nextElement) parentElement.insertBefore(element, nextElement);
  else parentElement.appendChild(element);
}

function appendStructuredTableBlock(tableElement: DataElement, block: TableBlock, startRowIndex: number): number {
  if (block.rows.length < 1) return startRowIndex;

  const headerRow = block.rows.length > 1 ? block.rows[0] : null;
  const dataRows = headerRow ? block.rows.slice(1) : block.rows;
  const rowLabelColumnIndex = resolveRowLabelColumnIndex(headerRow, dataRows);
  const columnNames = createColumnNames(headerRow?.cells ?? block.rows[0].cells, rowLabelColumnIndex);
  let rowIndex = startRowIndex;

  for (const row of dataRows) {
    const rowName =
      rowLabelColumnIndex == null ? `行${rowIndex}` : getCellText(row.cells[rowLabelColumnIndex]) || `行${rowIndex}`;
    const rowElement = createRowElement(rowName);
    let columnIndex = 0;

    for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex++) {
      if (cellIndex === rowLabelColumnIndex) continue;
      rowElement.appendChild(
        createFieldFromCell(columnNames[columnIndex] ?? `列${columnIndex + 1}`, row.cells[cellIndex])
      );
      columnIndex++;
    }

    tableElement.appendChild(rowElement);
    rowIndex++;
  }

  return rowIndex;
}

function appendStructuredPlainBlock(
  tableElement: DataElement,
  block: PlainBlock,
  startRowIndex: number,
  raw: string
): number {
  const text = getTokensText(block.tokens);
  if (text === 'テーブル表' && raw.includes('|')) return startRowIndex;
  if (block.tokens.length < 1 && text.length < 1) return startRowIndex;

  const rowElement = createRowElement(`行${startRowIndex}`);
  let checkIndex = 1;
  let plainText = '';

  for (let index = 0; index < block.tokens.length; index++) {
    const token = block.tokens[index];
    if (token.kind === 'check') {
      let label = '';
      const nextToken = block.tokens[index + 1];
      if (nextToken?.kind === 'text') {
        label = nextToken.text.trim();
        index++;
      }
      rowElement.appendChild(createCheckField(`チェック${checkIndex}`, token.checked, label));
      checkIndex++;
    } else {
      plainText += token.text;
    }
  }

  const normalizedText = plainText.trim();
  if (normalizedText) rowElement.appendChild(createTextField('内容', normalizedText));
  if (rowElement.children.length < 1) rowElement.appendChild(createTextField('内容', text));
  tableElement.appendChild(rowElement);
  return startRowIndex + 1;
}

function resolveRowLabelColumnIndex(headerRow: TableRow | null, rows: TableRow[]): number | null {
  if (!headerRow || headerRow.cells.length < 2 || rows.length < 1) return null;
  const lastIndex = headerRow.cells.length - 1;
  if (getCellText(headerRow.cells[lastIndex]) !== '') return null;
  return rows.every((row) => getCellText(row.cells[lastIndex]).length > 0) ? lastIndex : null;
}

function createColumnNames(cells: TableCell[], ignoredIndex: number | null): string[] {
  const used = new Set<string>();
  const columnNames: string[] = [];

  for (let index = 0; index < cells.length; index++) {
    if (index === ignoredIndex) continue;
    const baseName = getCellText(cells[index]) || `列${index + 1}`;
    const uniqueName = createUniqueName(baseName, used);
    used.add(uniqueName);
    columnNames.push(uniqueName);
  }

  return columnNames;
}

function createFieldFromCell(name: string, cell: TableCell): DataElement {
  const checkToken = cell.find((token): token is CheckToken => token.kind === 'check');
  if (checkToken) return createCheckField(name, checkToken.checked, getCellText(cell));
  return createTextField(name, getCellText(cell));
}

function createRowElement(name: string): DataElement {
  return DataElement.create(name, '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
}

function createCheckField(name: string, checked: boolean, label: string): DataElement {
  return DataElement.create(name, checked ? 1 : 0, {
    [DataElementAttribute.ROLE]: DataElementRole.FIELD,
    [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CHECK,
    [DataElementAttribute.CELL_TEXT]: label,
  });
}

function createTextField(name: string, value: string): DataElement {
  return DataElement.create(name, value, {
    [DataElementAttribute.ROLE]: DataElementRole.FIELD,
    [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.TEXT,
  });
}

function getCellText(cell: TableCell | undefined): string {
  return cell ? getTokensText(cell) : '';
}

function getTokensText(tokens: readonly Token[]): string {
  return tokens
    .filter((token): token is TextToken => token.kind === 'text')
    .map((token) => token.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function createUniqueName(baseName: string, used: ReadonlySet<string>): string {
  if (!used.has(baseName)) return baseName;
  let suffix = 2;
  while (used.has(`${baseName} ${suffix}`)) suffix++;
  return `${baseName} ${suffix}`;
}
