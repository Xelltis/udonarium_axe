import { inject, Injectable } from '@angular/core';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceTable } from '@axe/domain/dice/dice-table';
import {
  type AgentKind,
  type AnyAgentKind,
  anyKind,
  objectInput,
  textField,
} from '@axe/features/agent-tools/kinds/agent-kind';

/**
 * The kinds of thing that hold lines to send or to roll from, as the AI link's generic tools offer them:
 * the dice tables, the chat palettes and the like, each written as the screen's editors write them.
 */
@Injectable({ providedIn: 'root' })
export class AgentPaletteKinds {
  private readonly objectStore = inject(ObjectStore);

  readonly kinds: readonly AnyAgentKind[] = [anyKind(this.diceTable())];

  private diceTable(): AgentKind<DiceTable> {
    return {
      kind: DiceTable.aliasName,
      description:
        'A dice table: a chat command that rolls its dice and reads the result off its entries, one "number:result" to a line.',
      list: () => this.objectStore.getObjects<DiceTable>(DiceTable),
      idOf: (table) => table.identifier,
      nameOf: (table) => table.name,
      fields: [
        textField<DiceTable>(
          'name',
          'Its name.',
          'write',
          (table) => table.name,
          (table, value) => {
            table.name = value;
          },
          200
        ),
        textField<DiceTable>(
          'command',
          'The chat command that rolls on it.',
          'write',
          (table) => table.command,
          (table, value) => {
            table.command = value;
          },
          200
        ),
        textField<DiceTable>(
          'dice',
          'The dice it rolls, as 1d6 or 2d6.',
          'write',
          (table) => table.dice,
          (table, value) => {
            table.dice = value;
          },
          50
        ),
        textField<DiceTable>(
          'entries',
          'Its entries, one "number:result" to a line.',
          'write',
          (table) => `${table.diceTablePalette?.value ?? ''}`,
          (table, value) => table.diceTablePalette?.setPalette(value)
        ),
      ],
      create: {
        access: 'write',
        description: 'Makes a dice table with six example entries.',
        input: objectInput(),
        make: () => DiceTable.create(),
      },
      remove: { access: 'write', take: (table) => table.destroy() },
    };
  }
}
