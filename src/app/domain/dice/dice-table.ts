import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { DiceTablePalette } from '@axe/domain/chat/chat-palette';

@SyncObject('dice-table')
export class DiceTable extends ObjectNode {
  @SyncVar() name: string = 'ダイス表';
  @SyncVar() command: string = 'SAMPLE';
  @SyncVar() dice: string = '1d6';

  text: string = '';

  /**
   * The palette holding the table's entries, one `number:result` to a line, or null when it has
   * none.
   */
  get diceTablePalette(): DiceTablePalette | null {
    for (const child of this.children) {
      if (child instanceof DiceTablePalette) {
        return child;
      }
    }
    return null;
  }

  /** Makes and initializes a blank dice table with an example palette of six entries. */
  static create(): DiceTable {
    const diceTable: DiceTable = new DiceTable();
    diceTable.name = '白紙のダイス表';
    diceTable.initialize();

    const palette: DiceTablePalette = new DiceTablePalette(`table_${diceTable.identifier}`);

    palette.setPalette(
      `ダイス表入力例：
1:ダイス表チャート例【森】
2:ダイス表チャート例【海】
3:ダイス表チャート例【平地】
4:ダイス表チャート例【沼】
5:ダイス表チャート例【空】
6:ダイス表チャート例【山】`
    );
    palette.initialize();

    diceTable.appendChild(palette);
    return diceTable;
  }
}
