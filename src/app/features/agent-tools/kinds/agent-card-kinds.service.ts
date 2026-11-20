import { inject, Injectable } from '@angular/core';
import { type AgentSquare, AgentViews } from '@axe/application/agent/agent-views.service';
import { CardGameService } from '@axe/application/card/card-game.service';
import { CoinFlipService } from '@axe/application/coin/coin-flip.service';
import { DiceRollService } from '@axe/application/dice/dice-roll.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { stackSizeOf } from '@axe/application/tabletop/piece-drawings/card-drawings';
import { coinSizeOf } from '@axe/application/tabletop/piece-drawings/coin-drawing';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { getDiceMenuItems } from '@axe/application/tabletop/tabletop-action-helpers';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { copyBeside } from '@axe/application/ui/tabletop-context-menu-actions';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { AgentSchema } from '@axe/core/agent/agent-schema';
import { callShuffleCardStack } from '@axe/core/event/domain-events';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { getAuthorityPeerId } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { Coin, type CoinFace } from '@axe/domain/coin/coin';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CONCEALED_LOCATION } from '@axe/domain/tabletop/board-switch/concealment';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { isWithheldHere } from '@axe/domain/tabletop/withheld';
import { findOne } from '@axe/features/agent-tools/agent-lookup';
import {
  type AgentArgs,
  type AgentKind,
  type AgentKindAction,
  type AgentKindField,
  type AnyAgentKind,
  anyKind,
  choiceField,
  flagField,
  numberField,
  objectInput,
  textField,
} from '@axe/features/agent-tools/kinds/agent-kind';
import { AgentSquares, SQUARE_SCHEMA } from '@axe/features/agent-tools/kinds/agent-squares.service';

/** Where a thing made is laid, as every kind here takes it. */
const AT: AgentSchema = {
  ...SQUARE_SCHEMA,
  description: 'The square for its north-west corner. Leave out for the middle of the table.',
};

/** Why a thing locked in place is not moved or turned, as the screen hides its handles and holds it still. */
const LOCKED = 'It is locked in place; unlock it first.';

/** Why a card in this seat's hand is not handled as one on the table. */
const IN_HAND = "It is in this seat's hand; play it to the table first.";

/** Why a card another seat peeks at is not turned, peeked at, taken or put into a stack. */
const PEEKED_BY_ANOTHER =
  'Another seat connected now is peeking at this card, so it is theirs; it is not turned over, peeked at, taken into a hand or put into a stack until they let it go.';

/** Why a die another seat keeps is not turned or changed. */
const KEPT_BY_ANOTHER = "Another seat keeps this die, so its face is not this seat's to turn.";

/** The kinds of die the screen's create menu offers, by the name it gives each. */
const DICE_TYPES = getDiceMenuItems().map((item) => item.menuName);

/** A thing that lies on the table where it was put, and can be locked there and turned. */
type Placed = TabletopObject & { isLock: boolean; rotate: number };

/**
 * The kinds of the cards, the stacks of them, the dice and the coins on the table, as the AI link's
 * generic tools offer them: each listed as this seat sees the table, the fog and what the master has
 * put out of sight kept from it, a face kept from the seat never told, and turned, drawn, rolled and
 * tossed by the hands the screen's own menus use.
 */
@Injectable({ providedIn: 'root' })
export class AgentCardKinds {
  private readonly views = inject(AgentViews);
  private readonly squares = inject(AgentSquares);
  private readonly tabletop = inject(TabletopService);
  private readonly actions = inject(TabletopActionService);
  private readonly vision = inject(VisionService);
  private readonly disclosure = inject(DisclosureService);
  private readonly permission = inject(RolePermissionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly diceRoll = inject(DiceRollService);
  private readonly coinFlip = inject(CoinFlipService);
  private readonly cardGame = inject(CardGameService);
  private readonly t = inject(TRANSLATE_FN);

  private readonly cardKind = this.card();

  /** The card, card-stack, dice-symbol and coin kinds, in the order they are described to the AI. */
  readonly kinds: readonly AnyAgentKind[] = [
    anyKind(this.cardKind),
    anyKind(this.cardStack()),
    anyKind(this.diceSymbol()),
    anyKind(this.coin()),
  ];

  /**
   * Whether this seat comes across a thing standing where it stands: on the table and not under the
   * fog, as the table draws it, or put out of sight by the master, which only the master comes across.
   */
  private placedFor(object: TabletopObject, sizeCells: number): boolean {
    if (object.location.name === CONCEALED_LOCATION) return this.permission.isGameMaster();
    return object.location.name === 'table' && !this.vision.isPieceHiddenByFog(object, sizeCells);
  }

  /**
   * The point the screen's create menu is opened at for a thing made to lie from the square asked
   * for, or from the middle of the table: half a cell in from where its corner goes, as the screen
   * draws a thing made back by half a cell to sit under the pointer.
   */
  private pointAt(args: AgentArgs): PointerCoordinate {
    const square = args['at'] as AgentSquare | undefined;
    if (square && !this.squares.cornerOf(square)) {
      throw new AgentToolError('invalid_input', 'That square is off the table.');
    }
    const corner = this.squares.cornerOrMiddle(square);
    const half = this.tabletop.gridSize() / 2;
    return { x: corner.x + half, y: corner.y + half, z: 0 };
  }

  /** The user this seat is, which a card taken into a hand or a die kept goes to. */
  private myUserId(): string {
    const userId = PeerCursor.myUserId;
    if (!userId) throw new AgentToolError('not_allowed', 'This seat has no user yet, so it can hold nothing.');
    return userId;
  }

  /** A seat by its user, as the label on a card's back or under a die names it. */
  private seatOf(userId: string): string | undefined {
    return userId ? this.views.seatName(userId) : undefined;
  }

  /** A thing as this seat reads it, as the tools show one: its id and name, and every field it is shown. */
  private shown<T>(kind: AgentKind<T>, thing: T): Record<string, unknown> {
    const view: Record<string, unknown> = { id: kind.idOf(thing), name: kind.nameOf(thing) };
    for (const field of kind.fields) {
      const value = field.read(thing);
      if (value !== undefined) view[field.name] = value;
    }
    return view;
  }

  /**
   * The square a thing lies in, and moving it to another, as a drag sets it down; none for a thing
   * locked in place, or one `away` says is not on the table, which is read in no square.
   */
  private squareField<T extends Placed>(away: (object: T) => string | null = () => null): AgentKindField<T> {
    const field = this.squares.field<T>((object) => away(object) ?? (object.isLock ? LOCKED : null));
    return { ...field, read: (object) => (away(object) === null ? field.read(object) : undefined) };
  }

  /** How far a thing is turned, and turning it, as its handles turn it; not while it is locked. */
  private rotateField<T extends Placed>(away: (object: T) => string | null = () => null): AgentKindField<T> {
    return {
      ...numberField<T>(
        'rotate',
        'How far it is turned, in degrees clockwise.',
        'write',
        { minimum: 0, maximum: 360 },
        (object) => object.rotate,
        (object, value) => {
          object.rotate = value;
        }
      ),
      refuse: (object) => away(object) ?? (object.isLock ? LOCKED : null),
    };
  }

  /** Whether a thing is locked in place, as its menu locks it. */
  private lockedField<T extends Placed>(
    away: (object: T) => string | null = () => null,
    unlocked: (object: T) => void = () => undefined
  ): AgentKindField<T> {
    return {
      ...flagField<T>(
        'locked',
        'Whether it is locked in place, which keeps it from being moved or turned.',
        'write',
        (object) => object.isLock,
        (object, value) => {
          object.isLock = value;
          if (!value) unlocked(object);
        }
      ),
      refuse: away,
    };
  }

  /** Copying a thing beside itself, as its menu does, where `refused` lets it be. */
  private copyAction<T>(
    kind: () => AgentKind<T>,
    refused: (object: T) => string | null,
    copy: (object: T) => T
  ): AgentKindAction<T> {
    return {
      name: 'copy',
      description: 'Lays a copy of it a square to the south-east.',
      access: 'write',
      input: objectInput(),
      run: (object) => {
        const reason = refused(object);
        if (reason) throw new AgentToolError('not_allowed', reason);
        return this.shown(kind(), copy(object));
      },
    };
  }

  /** Every card this seat comes across: loose on the table in sight, or in its own hand. */
  private cards(): Card[] {
    return this.objectStore
      .getObjects<Card>(Card)
      .filter((card) => card.isLoose && (card.isInMyHand || this.placedFor(card, Math.max(0, card.size))));
  }

  private card(): AgentKind<Card> {
    const shown = (card: Card) => this.cardGame.canReadFront(card);
    const face = (read: (card: Card) => unknown) => (card: Card) => (shown(card) ? read(card) : undefined);
    const sheet = (card: Card) =>
      this.disclosure.canView(card) ? null : "This card's sheet is not shown to this seat, so it is not its to change.";
    const faceSheet = (card: Card) =>
      shown(card) ? sheet(card) : 'The face of this card is not shown to this seat, so it is not its to change.';
    const inHand = (card: Card) => (card.isInMyHand ? IN_HAND : null);
    const onTable = (card: Card) => {
      const reason = inHand(card);
      if (reason) throw new AgentToolError('not_allowed', reason);
    };
    const handled = (card: Card) => {
      onTable(card);
      if (card.isPeekedByAnother) throw new AgentToolError('not_allowed', PEEKED_BY_ANOTHER);
      if (!this.cardGame.canHandle(card))
        throw new AgentToolError('not_allowed', 'This seat may not change the table.');
    };
    const kind = () => this.cardKind;
    return {
      kind: Card.aliasName,
      description:
        "A card lying loose on the table, or held in this seat's hand. Where its face is not shown to this seat it goes by a plain title, and its name, words and how they are drawn are left out; the game master is shown every face. A card another seat connected now peeks at is theirs: it is not turned over, peeked at or taken into a hand. Cards inside a stack are not listed here: reach them through the card-stack's actions.",
      list: () => this.cards(),
      idOf: (card) => card.identifier,
      nameOf: (card) => (shown(card) ? card.name : this.t('feature.card.title')),
      fields: [
        {
          ...textField<Card>(
            'name',
            'Its name.',
            'write',
            face((card) => card.name),
            (card, value) => {
              card.name = value;
            },
            200
          ),
          refuse: faceSheet,
        },
        {
          ...textField<Card>(
            'text',
            'The words written over its front.',
            'write',
            face((card) => card.faceText),
            (card, value) => {
              card.faceText = value;
            }
          ),
          refuse: faceSheet,
        },
        {
          ...numberField<Card>(
            'font_size',
            'How large its words are drawn.',
            'write',
            { minimum: 1, maximum: 120, integer: true },
            face((card) => card.faceFontSize),
            (card, value) => {
              card.faceFontSize = value;
            }
          ),
          refuse: faceSheet,
        },
        {
          ...textField<Card>(
            'font_colour',
            'The colour its words are drawn in, as #rrggbb; anything else draws them in the usual colour.',
            'write',
            face((card) => card.faceFontColor),
            (card, value) => {
              card.faceFontColor = value;
            },
            7
          ),
          refuse: faceSheet,
        },
        {
          ...numberField<Card>(
            'size',
            'How many squares wide it is.',
            'write',
            { minimum: 1, maximum: 50 },
            (card) => card.size,
            (card, value) => {
              card.size = value;
            }
          ),
          refuse: sheet,
        },
        this.squareField<Card>(inHand),
        this.rotateField<Card>(inHand),
        this.lockedField<Card>(inHand, (card) => {
          card.dispLockMark = true;
        }),
        flagField<Card>(
          'face_up',
          'Whether it lies face up for everyone. Turn it with the face_up, face_down and peek actions.',
          null,
          (card) => card.isFront
        ),
        flagField<Card>('face_shown_to_me', 'Whether this seat sees its face.', null, (card) => shown(card)),
        textField<Card>(
          'peeked_by',
          'The seat looking at its face alone while it lies face down, as the label on its back says.',
          null,
          (card) => this.seatOf(card.owner)
        ),
        flagField<Card>('in_my_hand', "Whether it is in this seat's hand.", null, (card) => card.isInMyHand),
      ],
      create: {
        access: 'write',
        description: 'Lays a blank card face up on the table, nobody peeking at it.',
        input: objectInput({ at: AT }),
        make: (args) => {
          const card = this.actions.createBlankCard(this.pointAt(args));
          SoundEffect.play(PresetSound.cardPut);
          return card;
        },
      },
      remove: {
        access: 'write',
        take: (card) => {
          onTable(card);
          card.destroy();
          SoundEffect.play(PresetSound.sweep);
        },
      },
      actions: [
        {
          name: 'face_up',
          description:
            'Turns a card on the table face up for everyone, ending a peek of this seat or of a seat gone, and plays the cut-in tied to it.',
          access: 'write',
          input: objectInput(),
          run: (card) => {
            handled(card);
            if (card.isFront) throw new AgentToolError('invalid_input', 'It already lies face up.');
            this.cardGame.faceUp(card);
            return this.shown(kind(), card);
          },
        },
        {
          name: 'face_down',
          description: 'Turns a card on the table face down, ending a peek of this seat or of a seat gone.',
          access: 'write',
          input: objectInput(),
          run: (card) => {
            handled(card);
            if (!card.isFront && !card.isPeeking) {
              throw new AgentToolError('invalid_input', 'It already lies face down.');
            }
            this.cardGame.faceDown(card);
            return this.shown(kind(), card);
          },
        },
        {
          name: 'peek',
          description:
            'Turns a card on the table face down with its face shown to this seat alone ("show only me"), taking over from a seat that peeked at it and has gone.',
          access: 'write',
          input: objectInput(),
          run: (card) => {
            handled(card);
            if (card.isPeeking) throw new AgentToolError('invalid_input', 'This seat already peeks at it.');
            this.myUserId();
            this.cardGame.peek(card);
            return this.shown(kind(), card);
          },
        },
        {
          name: 'to_hand',
          description: "Takes a card on the table into this seat's hand, where its face is shown to this seat alone.",
          access: 'write',
          input: objectInput(),
          run: (card) => {
            handled(card);
            this.myUserId();
            this.cardGame.takeToHand([card]);
            return this.shown(kind(), card);
          },
        },
        {
          name: 'play',
          description:
            "Lays a card from this seat's hand on the table, face up or face down, where it lay before or in the square given.",
          access: 'write',
          input: objectInput(
            {
              face_up: { type: 'boolean', description: 'True to lay it face up, false face down.' },
              at: {
                ...SQUARE_SCHEMA,
                description: 'The square for its north-west corner. Leave out for where it lay.',
              },
            },
            ['face_up']
          ),
          run: (card, args) => {
            if (!card.isInMyHand) throw new AgentToolError('invalid_input', "It is not in this seat's hand.");
            const square = args['at'] as AgentSquare | undefined;
            const corner = square ? this.squares.cornerOf(square) : null;
            if (square && !corner) throw new AgentToolError('invalid_input', 'That square is off the table.');
            if (corner) {
              card.location.x = corner.x;
              card.location.y = corner.y;
            }
            if (args['face_up'] === true) {
              card.playFaceUp();
              SoundEffect.play(PresetSound.cardDraw);
            } else {
              card.playFaceDown();
              SoundEffect.play(PresetSound.cardPut);
            }
            card.toTopmost();
            card.update();
            this.objectChange.notifyChanged(card.identifier);
            return this.shown(kind(), card);
          },
        },
        this.copyAction<Card>(
          kind,
          (card) =>
            inHand(card) ??
            (isWithheldHere(card) ? "A room server keeps this card's face from this seat, so it is not copied." : null),
          (card) => {
            const copy = card.clone();
            copy.location.x += this.tabletop.gridSize();
            copy.location.y += this.tabletop.gridSize();
            copy.toTopmost();
            SoundEffect.play(PresetSound.cardPut);
            return copy;
          }
        ),
      ],
    };
  }

  /** A loose card on the table this seat comes across, by its id or name. */
  private tableCard(reference: string): Card {
    const card = findOne(
      this.cards().filter((each) => !each.isInMyHand),
      reference,
      (each) => each.identifier,
      (each) => this.cardKind.nameOf(each),
      'card on the table'
    );
    return card;
  }

  private cardStack(): AgentKind<CardStack> {
    const named = (stack: CardStack) => ({ id: stack.identifier, name: stack.name });
    const filled = (stack: CardStack) => {
      if (stack.isEmpty) throw new AgentToolError('invalid_input', 'It holds no cards.');
    };
    const drawn = (cards: readonly Card[]) => cards.map((card) => this.shown(this.cardKind, card));
    const kind: AgentKind<CardStack> = {
      kind: CardStack.aliasName,
      description:
        'A stack of cards on the table, such as a deck. Only its top card is told of, and only where that card lies face up; which cards it holds and in what order are never told. Draw, deal, shuffle and turn its cards with its actions.',
      list: () =>
        this.objectStore.getObjects<CardStack>(CardStack).filter((stack) => this.placedFor(stack, stackSizeOf(stack))),
      idOf: (stack) => stack.identifier,
      nameOf: (stack) => stack.name,
      fields: [
        textField<CardStack>(
          'name',
          'Its name.',
          'write',
          (stack) => stack.name,
          (stack, value) => {
            stack.name = value;
          },
          200
        ),
        this.squareField<CardStack>(),
        this.rotateField<CardStack>(),
        this.lockedField<CardStack>(),
        flagField<CardStack>(
          'show_count',
          'Whether the table shows how many cards it holds.',
          'write',
          (stack) => stack.isShowTotal,
          (stack, value) => {
            stack.isShowTotal = value;
          }
        ),
        numberField<CardStack>(
          'count',
          'How many cards it holds, told only while the table shows it.',
          null,
          { minimum: 0, integer: true },
          (stack) => (stack.isShowTotal ? stack.cards.length : undefined)
        ),
        textField<CardStack>(
          'top_card',
          'The name of its top card, told only where that card lies face up.',
          null,
          (stack) => (stack.topCard?.isVisible ? stack.topCard.name : undefined)
        ),
        flagField<CardStack>(
          'top_face_up',
          'Whether its top card lies face up; left out while it holds none.',
          null,
          (stack) => stack.topCard?.isFront
        ),
        textField<CardStack>(
          'looked_through_by',
          'The seat looking through its cards in a list just now, which it is held for.',
          null,
          (stack) => this.seatOf(stack.owner)
        ),
      ],
      create: {
        access: 'write',
        description:
          'Lays a deck on the table: playing cards (52 and two jokers) face up, or, given from_tag, one card for every picture under that image tag this seat may use, backed with the playing card back.',
        input: objectInput({
          at: AT,
          from_tag: { type: 'string', maxLength: 200, description: 'The image tag to make the cards from.' },
          use_image_names: {
            type: 'boolean',
            description: 'With from_tag: name each card after its picture rather than plainly.',
          },
        }),
        make: (args) => {
          const at = this.pointAt(args);
          const tag = args['from_tag'];
          const stack =
            typeof tag === 'string'
              ? this.actions.createDeckFromTag(at, tag, args['use_image_names'] === true)
              : this.actions.createTrump(at);
          if (!stack) {
            throw new AgentToolError('not_found', `No picture this seat may use is under the image tag ${tag}.`);
          }
          SoundEffect.play(PresetSound.cardPut);
          return stack;
        },
      },
      remove: {
        access: 'write',
        take: (stack) => {
          stack.setLocation('graveyard');
          stack.destroy();
          SoundEffect.play(PresetSound.sweep);
        },
      },
      actions: [
        {
          name: 'shuffle',
          description: 'Shuffles it, turning each card randomly upright or upside down.',
          access: 'write',
          input: objectInput(),
          run: (stack) => {
            stack.shuffle();
            SoundEffect.play(PresetSound.cardShuffle);
            callShuffleCardStack(stack.identifier);
            return this.shown(kind, stack);
          },
        },
        {
          name: 'draw',
          description:
            "Draws cards off the top, one after another: onto the table beside it as they lie, or into this seat's hand.",
          access: 'write',
          input: objectInput({
            count: { type: 'integer', minimum: 1, maximum: 200, description: 'How many to draw. 1 if left out.' },
            to: { type: 'string', enum: ['table', 'hand'], description: 'Where they go. The table if left out.' },
          }),
          run: (stack, args) => {
            filled(stack);
            const toHand = args['to'] === 'hand';
            if (toHand) this.myUserId();
            const count = Math.min(typeof args['count'] === 'number' ? args['count'] : 1, stack.cards.length);
            const cards: Card[] = [];
            for (let index = 0; index < count; index++) {
              const card = toHand ? this.cardGame.drawToHand(stack) : this.cardGame.drawCard(stack, index);
              if (!card) break;
              cards.push(card);
            }
            if (cards.length > 0) SoundEffect.play(PresetSound.cardDraw);
            return { drawn: drawn(cards) };
          },
        },
        {
          name: 'deal',
          description:
            'Shuffles it and deals all of it evenly into the hand of every seat playing, keeping one joker in the deal and putting any others back, and says so in the chat.',
          access: 'write',
          input: objectInput({
            deal_anyway: {
              type: 'boolean',
              description:
                'True to deal even where some cards are face down to this seat on a room server, so that every joker goes out too.',
            },
          }),
          run: (stack, args) => {
            if (stack.cards.some((card) => card.isFaceWithheld) && args['deal_anyway'] !== true) {
              const gameMasterHoldsThem =
                getAuthorityPeerId() !== null && !isNetworkIsolated() && !PeerCursor.isMyselfGameMaster;
              throw new AgentToolError(
                'not_allowed',
                `Some cards are face down to this seat, so its jokers cannot be told apart and every joker would be dealt too.${
                  gameMasterHoldsThem ? ' The game master holds every face and can deal it as it should be.' : ''
                } Pass deal_anyway to deal it all the same.`
              );
            }
            return this.cardGame.dealAll(stack);
          },
        },
        {
          name: 'put_card',
          description: 'Puts a loose card on the table onto it, on top or at the bottom, as a card dropped on it.',
          access: 'write',
          input: objectInput(
            {
              card: { type: 'string', description: 'The id or name of a card lying loose on the table.' },
              at: { type: 'string', enum: ['top', 'bottom'], description: 'Where it goes. The top if left out.' },
            },
            ['card']
          ),
          run: (stack, args) => {
            const card = this.tableCard(String(args['card']));
            if (card.isLock) throw new AgentToolError('not_allowed', `That card: ${LOCKED}`);
            const at = args['at'] === 'bottom' ? 'bottom' : 'top';
            if (this.cardGame.putIntoStack(stack, [card], at).length < 1) {
              throw new AgentToolError('not_allowed', `That card: ${PEEKED_BY_ANOTHER}`);
            }
            SoundEffect.play(PresetSound.cardPut);
            return this.shown(kind, stack);
          },
        },
        {
          name: 'turn_top',
          description: 'Turns its top card face up for everyone or face down, ending any peek at it.',
          access: 'write',
          input: objectInput({ face: { type: 'string', enum: ['up', 'down'] } }, ['face']),
          run: (stack, args) => {
            filled(stack);
            if (args['face'] === 'up') stack.faceUp();
            else stack.faceDown();
            SoundEffect.play(PresetSound.cardDraw);
            return this.shown(kind, stack);
          },
        },
        {
          name: 'turn_all',
          description: 'Turns every card in it face up for everyone or face down, ending any peeks.',
          access: 'write',
          input: objectInput({ face: { type: 'string', enum: ['up', 'down'] } }, ['face']),
          run: (stack, args) => {
            if (args['face'] === 'up') stack.faceUpAll();
            else stack.faceDownAll();
            SoundEffect.play(PresetSound.cardDraw);
            return this.shown(kind, stack);
          },
        },
        {
          name: 'upright_all',
          description: 'Turns every card in it back upright, undoing the upside-down cards a shuffle leaves.',
          access: 'write',
          input: objectInput(),
          run: (stack) => {
            stack.uprightAll();
            SoundEffect.play(PresetSound.cardDraw);
            return this.shown(kind, stack);
          },
        },
        {
          name: 'unify_size',
          description: 'Gives every card in it the size of its top card.',
          access: 'write',
          input: objectInput(),
          run: (stack) => {
            filled(stack);
            stack.unifyCardsSize(stack.topCard!.size);
            return this.shown(kind, stack);
          },
        },
        {
          name: 'split',
          description:
            'Deals its cards in turn into one new stack for every seat playing, laid beside it, and takes it away.',
          access: 'write',
          input: objectInput(),
          destructive: true,
          run: (stack) => {
            if (this.cardGame.splitSeats() < 2)
              throw new AgentToolError('invalid_input', 'Only one seat plays, so there is none to split it for.');
            return { stacks: this.cardGame.split(stack).map(named) };
          },
        },
        {
          name: 'break',
          description: 'Scatters all its cards loose where it lay, as they lie, and takes the empty stack away.',
          access: 'write',
          input: objectInput(),
          destructive: true,
          run: (stack) => {
            return { cards: drawn(this.cardGame.breakUp(stack)) };
          },
        },
        this.copyAction<CardStack>(
          () => kind,
          (stack) =>
            isWithheldHere(stack)
              ? 'A room server keeps the face of a card in it from this seat, so it is not copied.'
              : null,
          (stack) => {
            const copy = stack.clone();
            copy.location.x += this.tabletop.gridSize();
            copy.location.y += this.tabletop.gridSize();
            copy.toTopmost();
            SoundEffect.play(PresetSound.cardPut);
            return copy;
          }
        ),
      ],
    };
    return kind;
  }

  private diceSymbol(): AgentKind<DiceSymbol> {
    const seesFace = (die: DiceSymbol) => this.diceRoll.readsFace(die);
    const seesName = (die: DiceSymbol) => this.diceRoll.showsName(die);
    const turned = (die: DiceSymbol) => (this.diceRoll.canTurn(die) ? null : KEPT_BY_ANOTHER);
    const changed = (die: DiceSymbol) => (this.diceRoll.canChange(die) ? null : KEPT_BY_ANOTHER);
    const sheet = (die: DiceSymbol) =>
      this.disclosure.canView(die)
        ? changed(die)
        : "This die's sheet is not shown to this seat, so it is not its to change.";
    const thrown = (die: DiceSymbol) => {
      const reason = turned(die);
      if (reason) throw new AgentToolError('not_allowed', reason);
    };
    const kind: AgentKind<DiceSymbol> = {
      kind: DiceSymbol.aliasName,
      description:
        'A die standing on the table. A die a seat keeps shows its face to that seat alone (and the game master), and its face is left out for any other, its name too, as it is where the name is hidden; only its keeper may roll it or set its face, and those two may hide its name or change it. Roll it, set its face, show it or keep it with its actions.',
      list: () =>
        this.objectStore.getObjects<DiceSymbol>(DiceSymbol).filter((die) => this.placedFor(die, Math.max(0, die.size))),
      idOf: (die) => die.identifier,
      nameOf: (die) => (seesName(die) ? die.name : ''),
      fields: [
        {
          ...textField<DiceSymbol>(
            'name',
            'Its name.',
            'write',
            (die) => (seesName(die) ? die.name : undefined),
            (die, value) => {
              die.name = value;
            },
            200
          ),
          refuse: sheet,
        },
        {
          ...numberField<DiceSymbol>(
            'size',
            'How many squares across it is.',
            'write',
            { minimum: 1, maximum: 10 },
            (die) => die.size,
            (die, value) => {
              die.size = value;
            }
          ),
          refuse: sheet,
        },
        this.squareField<DiceSymbol>(),
        this.rotateField<DiceSymbol>(),
        this.lockedField<DiceSymbol>(),
        {
          ...flagField<DiceSymbol>(
            'hide_name',
            'Whether its name is kept off the table for every seat but the game master.',
            'write',
            (die) => die.hideName,
            (die, value) => {
              this.diceRoll.setNameHidden(die, value);
            }
          ),
          refuse: changed,
        },
        flagField<DiceSymbol>(
          'used',
          'Whether it is marked as spent.',
          'write',
          (die) => die.isUsed,
          (die, value) => {
            die.isUsed = value;
          }
        ),
        textField<DiceSymbol>(
          'face',
          'The face it shows; left out where it is kept from this seat. Change it with roll or set_face.',
          null,
          (die) => (seesFace(die) ? die.face : undefined)
        ),
        {
          name: 'faces',
          description: 'Every face it can show.',
          schema: { type: 'array', items: { type: 'string' } },
          access: null,
          read: (die) => die.faces,
        },
        textField<DiceSymbol>(
          'kept_by',
          'The seat that keeps its face to itself, as the label under it says.',
          null,
          (die) => this.seatOf(die.owner)
        ),
      ],
      create: {
        access: 'write',
        description:
          'Stands a new die on the table, showing its first face; kept, it shows its face to this seat alone.',
        input: objectInput({
          at: AT,
          type: { type: 'string', enum: DICE_TYPES, description: 'What die it is. D6 if left out.' },
          kept: { type: 'boolean', description: 'True to keep its face to this seat alone.' },
        }),
        make: (args) => {
          const item = getDiceMenuItems().find((each) => each.menuName === (args['type'] ?? 'D6'))!;
          const [die] = this.actions.createDiceSymbols(this.pointAt(args), item, 1, {
            hiddenToOthers: args['kept'] === true,
          });
          SoundEffect.play(PresetSound.dicePut);
          return die;
        },
      },
      remove: {
        access: 'write',
        take: (die) => {
          die.destroy();
          SoundEffect.play(PresetSound.sweep);
        },
      },
      actions: [
        {
          name: 'roll',
          description:
            'Rolls it and says the face in the chat: openly, or in secret where this seat keeps it. Only for a die whose face this seat may see.',
          access: 'write',
          input: objectInput(),
          run: (die) => {
            thrown(die);
            this.diceRoll.roll([die]);
            return this.shown(kind, die);
          },
        },
        {
          name: 'set_face',
          description: 'Turns it to a face. Only for a die whose face this seat may see.',
          access: 'write',
          input: objectInput({ face: { type: 'string', maxLength: 50, description: 'One of its faces.' } }, ['face']),
          run: (die, args) => {
            thrown(die);
            const face = String(args['face']);
            if (!die.faces.includes(face)) {
              throw new AgentToolError('invalid_input', `It has no face ${face} (it has ${die.faces.join(', ')}).`);
            }
            this.diceRoll.setFace(die, face);
            SoundEffect.play(PresetSound.dicePut);
            return this.shown(kind, die);
          },
        },
        {
          name: 'reveal',
          description:
            'Shows the face of a kept die to everyone, opening its secret roll in the chat or saying the face there. For the seat that keeps it, or the game master.',
          access: 'write',
          input: objectInput(),
          run: (die) => {
            if (!die.hasOwner) throw new AgentToolError('invalid_input', 'No seat keeps it.');
            if (!this.diceRoll.reveal(die)) {
              throw new AgentToolError(
                'not_allowed',
                'Only the seat that keeps a die, or the game master, may show its face.'
              );
            }
            return this.shown(kind, die);
          },
        },
        {
          name: 'keep',
          description:
            'Keeps its face to this seat alone ("show only me"). A die another seat keeps is theirs; only the game master may take it.',
          access: 'write',
          input: objectInput(),
          run: (die) => {
            if (die.isMine) throw new AgentToolError('invalid_input', 'This seat already keeps it.');
            this.myUserId();
            if (!this.diceRoll.keep(die)) {
              throw new AgentToolError('not_allowed', 'Another seat keeps this die; only the game master may take it.');
            }
            return this.shown(kind, die);
          },
        },
        this.copyAction<DiceSymbol>(
          () => kind,
          (die) =>
            isWithheldHere(die) ? "A room server keeps this die's face from this seat, so it is not copied." : null,
          (die) => {
            const copy = copyBeside(die, this.tabletop.gridSize());
            SoundEffect.play(PresetSound.dicePut);
            return copy;
          }
        ),
      ],
    };
    return kind;
  }

  private coin(): AgentKind<Coin> {
    const kind: AgentKind<Coin> = {
      kind: Coin.aliasName,
      description:
        'A coin on the table, lying on its front or its back. Toss it with flip, which says the result in the chat, or lay it on a face with set_face.',
      list: () => this.objectStore.getObjects<Coin>(Coin).filter((coin) => this.placedFor(coin, coinSizeOf(coin))),
      idOf: (coin) => coin.identifier,
      nameOf: (coin) => coin.name,
      fields: [
        textField<Coin>(
          'name',
          'Its name.',
          'write',
          (coin) => coin.name,
          (coin, value) => {
            coin.name = value;
          },
          200
        ),
        numberField<Coin>(
          'size',
          'How many squares across it is.',
          'write',
          { minimum: 1, maximum: 10 },
          (coin) => coin.size,
          (coin, value) => {
            coin.size = value;
          }
        ),
        this.squareField<Coin>(),
        this.rotateField<Coin>(),
        this.lockedField<Coin>(),
        choiceField<Coin, CoinFace>(
          'face',
          'The face it lies on. Change it with flip or set_face.',
          null,
          ['front', 'back'],
          (coin) => coin.face
        ),
      ],
      create: {
        access: 'write',
        description: 'Lays a new coin on the table, front up.',
        input: objectInput({ at: AT }),
        make: (args) => {
          const coin = this.actions.createCoin(this.pointAt(args));
          SoundEffect.play(PresetSound.dicePut);
          return coin;
        },
      },
      remove: {
        access: 'write',
        take: (coin) => {
          coin.destroy();
          SoundEffect.play(PresetSound.sweep);
        },
      },
      actions: [
        {
          name: 'flip',
          description: 'Tosses it for everyone to see spin, and says the face it lands on in the chat.',
          access: 'write',
          input: objectInput(),
          run: (coin) => {
            this.coinFlip.flip(coin);
            return this.shown(kind, coin);
          },
        },
        {
          name: 'set_face',
          description: 'Lays it on a face, without tossing it.',
          access: 'write',
          input: objectInput({ face: { type: 'string', enum: ['front', 'back'] } }, ['face']),
          run: (coin, args) => {
            coin.face = args['face'] === 'back' ? 'back' : 'front';
            SoundEffect.play(PresetSound.cardDraw);
            return this.shown(kind, coin);
          },
        },
        this.copyAction<Coin>(
          () => kind,
          () => null,
          (coin) => {
            const copy = coin.clone();
            copy.location.x += this.tabletop.gridSize();
            copy.location.y += this.tabletop.gridSize();
            copy.toTopmost();
            SoundEffect.play(PresetSound.cardPut);
            return copy;
          }
        ),
      ],
    };
    return kind;
  }
}
