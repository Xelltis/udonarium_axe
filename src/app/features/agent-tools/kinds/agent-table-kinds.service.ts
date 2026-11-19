import { inject, Injectable } from '@angular/core';
import { AgentViews } from '@axe/application/agent/agent-views.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import type { AgentSchema } from '@axe/core/agent/agent-schema';
import { CONCEALED_LOCATION } from '@axe/domain/tabletop/board-switch/concealment';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { TextNote } from '@axe/domain/tabletop/text-note';
import {
  type AgentKind,
  type AgentKindField,
  type AnyAgentKind,
  anyKind,
  choiceField,
  flagField,
  numberField,
  objectInput,
  textField,
} from '@axe/features/agent-tools/kinds/agent-kind';

/** A square of the table, as the generic tools take and give one. */
const SQUARE: AgentSchema = {
  type: 'object',
  description: 'A square of the table: col counted from 1 at the west edge, row from 1 at the north edge.',
  properties: {
    col: { type: 'integer', minimum: 1 },
    row: { type: 'integer', minimum: 1 },
  },
  required: ['col', 'row'],
  additionalProperties: false,
};

/** Who a note's words are shown to, as the screen names the choices. */
const DISCLOSURES = ['all', 'gm', 'selected'] as const;

/**
 * The kinds of thing that lie on the table, as the AI link's generic tools offer them: each listed as
 * this seat sees the table, the fog and what the master has put out of sight kept from it, and made and
 * changed through the services the screen's own hand goes through.
 */
@Injectable({ providedIn: 'root' })
export class AgentTableKinds {
  private readonly views = inject(AgentViews);
  private readonly tabletop = inject(TabletopService);
  private readonly actions = inject(TabletopActionService);
  private readonly vision = inject(VisionService);
  private readonly disclosure = inject(DisclosureService);
  private readonly permission = inject(RolePermissionService);

  readonly kinds: readonly AnyAgentKind[] = [anyKind(this.textNote())];

  /** Whether this seat comes across a thing lying on the table: not under the fog, nor put out of sight but for the master. */
  private onTableFor(object: TabletopObject): boolean {
    if (object.location.name === CONCEALED_LOCATION) return this.permission.isGameMaster();
    return object.location.name === 'table' && !this.vision.isPieceHiddenByFog(object);
  }

  /** The square a thing lying on the table is in, and moving it to the middle of another. */
  private squareField<T extends TabletopObject>(): AgentKindField<T> {
    return {
      name: 'square',
      description: 'The square it lies in.',
      schema: SQUARE,
      access: 'write',
      read: (object) => this.views.squareAt(object.location.x, object.location.y),
      put: (object, value) => {
        const middle = this.views.middleOf(value as { col: number; row: number });
        if (!middle) return;
        object.location.x = middle.x;
        object.location.y = middle.y;
        object.update();
      },
    };
  }

  private textNote(): AgentKind<TextNote> {
    const shown = (note: TextNote) => this.disclosure.canView(note);
    const words = (read: (note: TextNote) => unknown) => (note: TextNote) => (shown(note) ? read(note) : undefined);
    return {
      kind: TextNote.aliasName,
      description:
        'A note lying on the table, with a title and words. Its title and words are left out where the note is not shown to this seat.',
      list: () => this.tabletop.textNotes.filter((note) => this.onTableFor(note)),
      idOf: (note) => note.identifier,
      nameOf: (note) => (shown(note) ? note.title : ''),
      refuse: (note) => (shown(note) ? null : 'This note is not shown to this seat, so it is not its to change.'),
      fields: [
        textField<TextNote>(
          'title',
          'The title.',
          'write',
          words((note) => note.title),
          (note, value) => {
            note.title = value;
          }
        ),
        textField<TextNote>(
          'text',
          'The words.',
          'write',
          words((note) => note.text),
          (note, value) => {
            note.text = value;
          }
        ),
        this.squareField<TextNote>(),
        numberField<TextNote>(
          'width',
          'How many squares wide.',
          'write',
          { minimum: 1, maximum: 50 },
          (note) => note.width,
          (note, value) => {
            note.width = value;
          }
        ),
        numberField<TextNote>(
          'height',
          'How many squares tall.',
          'write',
          { minimum: 1, maximum: 50 },
          (note) => note.height,
          (note, value) => {
            note.height = value;
          }
        ),
        numberField<TextNote>(
          'font_size',
          'How large the words are drawn.',
          'write',
          { minimum: 1, maximum: 200 },
          (note) => note.fontSize,
          (note, value) => {
            note.fontSize = value;
          }
        ),
        flagField<TextNote>(
          'upright',
          'Whether it stands upright rather than lying flat.',
          'write',
          (note) => note.isUpright,
          (note, value) => {
            note.isUpright = value;
          }
        ),
        flagField<TextNote>(
          'formatted',
          'Whether the words are drawn with their formatting.',
          'write',
          (note) => note.isFormatted,
          (note, value) => {
            note.isFormatted = value;
          }
        ),
        flagField<TextNote>(
          'locked',
          'Whether it is locked in place.',
          'write',
          (note) => note.isLock,
          (note, value) => {
            note.isLock = value;
          }
        ),
        {
          ...choiceField<TextNote, (typeof DISCLOSURES)[number]>(
            'shown_to',
            'Who its words are shown to: everyone, the game master only, or the seats chosen for it.',
            'write',
            DISCLOSURES,
            (note) => (note.disclosureMode === '' ? 'all' : note.disclosureMode),
            (note, value) => {
              note.disclosureMode = value;
            }
          ),
          refuse: (note) =>
            this.disclosure.canEdit(note)
              ? null
              : "Who a note is shown to is its owner's and the game master's to say.",
        },
      ],
      create: {
        access: 'write',
        description:
          'Lays a new note on the table in view, owned by this seat; a note the master lays starts shown to the master only.',
        input: objectInput({
          at: { ...SQUARE, description: 'The square to lay it in. Leave out for the middle of the table.' },
        }),
        make: (args) => {
          const square = args['at'] as { col: number; row: number } | undefined;
          const table = this.tabletop.currentTable;
          const middle = (square ? this.views.middleOf(square) : null) ?? {
            x: (table.width * table.gridSize) / 2,
            y: (table.height * table.gridSize) / 2,
          };
          return this.actions.createTextNote({ x: middle.x, y: middle.y, z: 0 });
        },
      },
      remove: { access: 'write', take: (note) => note.destroy() },
    };
  }
}
