import { SyncObject } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DataElement } from '@axe/domain/data/data-element';

@SyncObject('markdown')
export class MarkDown extends GameObject {
  clickTimeStamp = 0;

  /**
   * Flips the check box a user clicked in rendered text and writes the new text back to its data element.
   *
   * The clicked input's id, as built by {@link markDownCheckBox}, names the element and the box. Does nothing
   * for an id of another shape, an element that no longer exists, a box number out of range, or a second
   * delivery of the same click event.
   */
  changeMarkDownCheckBox(cliskId: string, timeStamp: number) {
    const match = cliskId.match(/^(.*)_mark_(\d{8})$/);

    if (!match) return;

    const parentId = match[1];
    const boxNum = match[2];
    const object = ObjectStore.instance.get<DataElement>(parentId);

    if (!object) return;

    // The guard against the same event arriving twice.
    if (this.clickTimeStamp == timeStamp) {
      return;
    } else {
      this.clickTimeStamp = timeStamp;
    }

    const objectValue: string = object.value as string;

    const clickIndex = parseInt(boxNum);

    const splitText = objectValue.split(/[[［][xXｘＸ]?[\]］]/g);
    const matchText = objectValue.match(/[[［][xXｘＸ]?[\]］]/g);

    if (!matchText || clickIndex < 0 || matchText.length <= clickIndex) return;

    let changeText = matchText[clickIndex];

    if (changeText.match(/[[［][xXｘＸ][\]］]/)) {
      changeText = '[]';
    } else {
      changeText = '[x]';
    }

    let newText = '';
    let i;
    for (i = 0; i < matchText.length; i++) {
      if (i != clickIndex) {
        newText += splitText[i] + matchText[i];
      } else {
        newText += splitText[i] + changeText;
      }
    }
    for (; i < splitText.length; i++) {
      newText += splitText[i];
    }

    object.value = newText;
  }

  /**
   * HTML-escapes the text and turns each `[ ]` or `[x]` into a checkbox input.
   *
   * Each checkbox gets the id `<baseId>_mark_<8-digit index>` so a click can be traced back to its box.
   * Run this before {@link markDownTable}, which does no escaping of its own.
   */
  markDownCheckBox(text: string, baseId: string) {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const withCheckboxes = escaped
      .replace(/[[［][xXｘＸ][\]］]/g, '<input type="checkbox" checked="checked" class="markdown_checkbox" />')
      .replace(/[[［][\]］]/g, '<input type="checkbox" class="markdown_checkbox" />');

    const parts = withCheckboxes.split('<input ');
    return parts
      .map((part, i) => {
        if (i === 0) return part;
        const num = String(i - 1).padStart(8, '0');
        return `<input id="${baseId}_mark_${num}" ${part}`;
      })
      .join('');
  }

  /**
   * Turns runs of lines containing `|` into div-based table rows, one cell per part between the bars.
   *
   * Text before the first bar of a table's first line is kept, text outside the outer bars is otherwise
   * dropped, and other lines pass through as they are.
   */
  markDownTable(text: string) {
    const lines = text.split('\n');
    const out: string[] = [];
    let inTable = false;

    for (const line of lines) {
      const cols = line.split(/[|｜]/);
      if (cols.length === 1) {
        if (inTable) {
          out.push('</div>');
          inTable = false;
        }
        out.push(`${line}\n`);
      } else {
        if (!inTable) {
          out.push(cols[0]);
          out.push('<div class="markdown_table">');
          inTable = true;
        }
        out.push(this.buildTableRow(cols));
      }
    }
    if (inTable) out.push('</div>');
    return out.join('');
  }

  private buildTableRow(cols: string[]): string {
    const cells = cols
      .slice(1, -1)
      .map((col) => `<div class="markdown_table_cell">${col}</div>`)
      .join('');
    return `<div class="markdown_table_row">${cells}</div>`;
  }
}
