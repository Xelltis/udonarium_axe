import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService, TabletopObjectSelection } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { TargetArrowGeometry, targetArrowGeometry } from '@axe/domain/card/target-arrow';
import { GameCharacter } from '@axe/domain/character/game-character';
import { effectAreaTargets } from '@axe/domain/effect/effect-area';
import { EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectPickOrder, toggleEffectPick } from '@axe/domain/effect/effect-target-picks';

/** No piece picked. */
const NO_PICKS: ReadonlyMap<string, number> = new Map();

/** The order mark shown on a chosen piece. */
export interface EffectTargetMark {
  identifier: string;
  order: number;
  x: number;
  y: number;
  z: number;
}

/** Where the piece an effect is cast from stands, for the mark laid under it. */
export interface EffectCasterMark {
  identifier: string;
  x: number;
  y: number;
  z: number;
}

/** A piece an area attack would take in, for the mark laid under it before the centre is pressed. */
export interface EffectProspectMark {
  identifier: string;
  x: number;
  y: number;
  z: number;
}

/** What an area attack would reach and take in, were the piece under the pointer pressed as its centre. */
export interface EffectAreaProspect {
  center: { x: number; y: number; z: number };
  /** How far it reaches from the centre, in table pixels. */
  radius: number;
  /** The pieces it would take in that this reader can see, nearest first. */
  marks: EffectProspectMark[];
}

/** An effect cast by a confirm, and the pieces it was cast at that its caster's reader was shown picked. */
export interface EffectConfirmedCast {
  preset: EffectPreset;
  /** The identifiers of the pieces cast at that this reader was shown, in the order picked. */
  shown: readonly string[];
}

/** The line drawn from the caster to a target. */
export interface EffectTargetLink extends TargetArrowGeometry {
  identifier: string;
}

/**
 * Choosing targets in order.
 *
 * The ordered array is the truth; a piece's `targeted` flag is a copy of it.
 * That way the chat shorthand reaches the same targets once the choosing is done.
 * Nothing is cast by choosing: an effect held ready is cast by {@link confirm} alone.
 */
@Injectable({ providedIn: 'root' })
export class EffectTargetingService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly castService = inject(EffectCastService);
  private readonly zones = inject(EngagementZoneService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly vision = inject(VisionService);
  private readonly pieceLinks = inject(PieceLinksService);
  private readonly viewport = inject(ViewportService);

  private readonly _preset = signal<EffectPreset | null>(null);
  private readonly _picks = signal<readonly string[]>([]);
  private readonly _casterIdentifier = signal('');
  private readonly _epicenter = signal('');
  private readonly _changingCaster = signal(false);
  private readonly _hovered = signal('');
  private readonly _lastConfirmed = signal<EffectConfirmedCast | null>(null);

  /** The effect held ready, or null while none is. */
  readonly preset = this._preset.asReadonly();
  /** The identifiers of the pieces picked, in the order picked. */
  readonly picks = this._picks.asReadonly();
  /** The identifier of the piece the effect is cast from, fixed for as long as it is held ready; empty for none. */
  readonly casterIdentifier = this._casterIdentifier.asReadonly();
  /** Whether the next piece pressed is taken as the caster rather than picked as a target. */
  readonly isChangingCaster = this._changingCaster.asReadonly();
  /**
   * The identifier of the piece an effect chosen now would be cast from: the selected piece, where it
   * is a piece on the table. Empty for none.
   */
  readonly upcomingCasterIdentifier = computed<string>(() => {
    this.objectChange.collectionOf('character')();
    const identifier = this.selectedCasterIdentifier();
    if (identifier.length > 0) this.objectChange.versionOf(identifier)();
    return identifier;
  });
  /** The piece chosen as the centre of an area attack. */
  readonly epicenter = this._epicenter.asReadonly();
  /**
   * The last effect a confirm cast, wherever the confirm came from, a new object for each cast; null
   * until one is.
   */
  readonly lastConfirmed = this._lastConfirmed.asReadonly();

  /** The radius it catches, in px. Zero means it is not an area attack. */
  readonly areaRadius = computed<number>(() => {
    const cells = this._preset()?.areaRadiusCells ?? 0;
    return cells > 0 ? cells * this.tabletopService.gridSize() : 0;
  });

  /** The centre of the area, where the circle is drawn. */
  readonly areaCenter = computed<{ x: number; y: number; z: number } | null>(() => {
    if (this.areaRadius() <= 0) return null;
    const character = this.characterOf(this._epicenter());
    if (!character) return null;
    this.objectChange.versionOf(character.identifier)();
    return this.centerOf(character, this.tabletopService.gridSize());
  });
  readonly isPicking = computed(() => this._preset() != null);
  /** The colour the numbers of the picks are drawn in: the effect's own first colour. */
  readonly markColor = computed(() => this._preset()?.colorPrimary ?? '#ffd27f');
  /** How many pieces the effect held ready takes at most; zero while none is. */
  readonly limit = computed(() => this._preset()?.targetLimit ?? 0);

  /** The targets from before the choosing began, restored on cancel. */
  private previousTargets: readonly string[] = [];
  /** The pieces already chosen at the start, which do not count as chosen again. */
  private beganWithSelection: TabletopObjectSelection | null = null;

  /**
   * The number each piece picked is given, by its identifier, in the order picked, as this reader is
   * shown them: a piece this reader cannot see, in the dark, under the fog or in stealth, is struck
   * all the same but given no number, and the numbers are counted among those shown, so no gap
   * tells of it.
   */
  readonly pickOrder = computed<ReadonlyMap<string, number>>(() => {
    if (!this.isPicking()) return NO_PICKS;
    this.objectChange.collectionOf('character')();
    const shown = this._picks().filter((identifier) => {
      const character = this.characterOf(identifier);
      if (!character) return false;
      this.objectChange.versionOf(identifier)();
      return this.vision.isTokenVisible(character);
    });
    return new Map(shown.map((identifier) => [identifier, effectPickOrder(shown, identifier)]));
  });

  /**
   * The marks laid on the table for the pieces picked, numbered as {@link pickOrder} numbers them. A
   * part picked with its body is given none, as it is drawn with the body and its mark would lie over
   * the body's: its number shows on its row under the body's name instead.
   */
  readonly marks = computed<EffectTargetMark[]>(() => {
    const order = this.pickOrder();
    if (order.size < 1) return [];
    const gridSize = this.tabletopService.gridSize();
    const marks: EffectTargetMark[] = [];
    for (const [identifier, number] of order) {
      const character = this.characterOf(identifier)!;
      const body = this.pieceLinks.bodyOf(character);
      if (body && order.has(body.identifier)) continue;
      marks.push({ identifier, order: number, ...this.centerOf(character, gridSize) });
    }
    return marks;
  });

  /**
   * Where the mark of the caster is laid while an effect is held ready: under the piece it is cast
   * from, or nowhere when it has no caster or this reader cannot see the piece.
   */
  readonly casterMark = computed<EffectCasterMark | null>(() => {
    if (!this.isPicking()) return null;
    this.objectChange.collectionOf('character')();
    const caster = this.characterOf(this._casterIdentifier());
    if (!caster) return null;
    this.objectChange.versionOf(caster.identifier)();
    if (!this.vision.isTokenVisible(caster)) return null;
    return { identifier: caster.identifier, ...this.centerOf(caster, this.tabletopService.gridSize()) };
  });

  /**
   * What the area attack held ready would reach and take in, were the piece under the pointer pressed
   * as its centre: worked out as {@link pick} works it out, so what is shown is what the press takes.
   * Null for an effect with no area, while the next press names the caster, where the pointer is over
   * no piece, over the centre already pressed or over the caster a press would not take, and where the
   * main pointer cannot hover.
   */
  readonly areaProspect = computed<EffectAreaProspect | null>(() => {
    const preset = this._preset();
    const radius = this.areaRadius();
    if (!preset || radius <= 0 || this._changingCaster() || !this.viewport.canHover()) return null;
    const hovered = this._hovered();
    if (hovered.length < 1 || hovered === this._epicenter() || this.isCasterKeptOut(hovered)) return null;

    this.objectChange.collectionOf('character')();
    const center = this.characterOf(hovered);
    if (!center) return null;
    for (const character of this.tabletopService.characters) this.objectChange.versionOf(character.identifier)();

    const gridSize = this.tabletopService.gridSize();
    const shown = this.areaPicks(preset, center)
      .map((identifier) => this.characterOf(identifier))
      .filter((character): character is GameCharacter => character != null && this.vision.isTokenVisible(character));
    const identifiers = new Set(shown.map((character) => character.identifier));
    const marks: EffectProspectMark[] = [];
    for (const character of shown) {
      const body = this.pieceLinks.bodyOf(character);
      if (body && identifiers.has(body.identifier)) continue;
      marks.push({ identifier: character.identifier, ...this.centerOf(character, gridSize) });
    }
    return { center: this.centerOf(center, gridSize), radius, marks };
  });

  readonly links = computed<EffectTargetLink[]>(() => {
    if (!this.isPicking()) return [];
    const caster = this.characterOf(this._casterIdentifier());
    if (!caster) return [];

    const gridSize = this.tabletopService.gridSize();
    this.objectChange.versionOf(caster.identifier)();
    const from = this.centerOf(caster, gridSize);

    const links: EffectTargetLink[] = [];
    for (const mark of this.marks()) {
      const geometry = targetArrowGeometry(from, mark);
      if (geometry) links.push({ identifier: mark.identifier, ...geometry });
    }
    return links;
  });

  constructor() {
    effect(() => {
      const selected = this.selectionSignalService.selectedObject();
      if (!selected || !untracked(this.isPicking)) return;
      // A piece already chosen before the start was not pressed again, so it is not a target.
      if (selected === this.beganWithSelection) {
        this.beganWithSelection = null;
        return;
      }
      untracked(() => {
        if (this._changingCaster()) this.setCaster(selected.identifier);
        else this.pick(selected.identifier);
      });
    });
    // A seat made a guest while it aimed casts nothing; the aiming is called off.
    effect(() => {
      this.objectChange.trackMyCursor();
      if (!this.rolePermission.canEditTabletop() && untracked(this.isPicking)) untracked(() => this.cancel());
    });
  }

  /**
   * Begins choosing, holding the effect ready without casting it. It inherits whatever is already
   * named, so a target set from the remote or from chat can be cast at straight away. An effect cast
   * on oneself with nothing named starts with the caster picked. One that needs somebody else, with
   * the selected piece among those named, starts with no caster: the piece is its target.
   */
  begin(preset: EffectPreset): void {
    const targeted = this.tabletopService.characters.filter(
      (character) => character.isVisibleOnTable && character.targeted
    );
    const shown = targeted
      .filter((character) => this.vision.isTokenVisible(character))
      .map((character) => character.identifier);

    // Every piece aimed at, one gone out of sight since among them, is put back as aimed at on cancel.
    this.previousTargets = targeted.map((character) => character.identifier);
    this.beganWithSelection = untracked(this.selectionSignalService.selectedObject);
    const selected = this.selectedCasterIdentifier();
    const inherited = shown.slice(0, Math.max(preset.targetLimit, 1));
    const caster = preset.effectTargeting !== 'self' && inherited.includes(selected) ? '' : selected;
    this._preset.set(preset);
    this._changingCaster.set(false);
    this._picks.set(
      inherited.length < 1 && preset.effectTargeting === 'self' && caster.length > 0 ? [caster] : inherited
    );
    // The shooter is the selected piece, caught at the start because choosing moves the selection onto the targets.
    this._casterIdentifier.set(caster);
    this.mirror();
  }

  /**
   * Casts an effect from a piece by something other than the list of effects: a slot of the hotbar,
   * the piece's own menu, a row of its sheet. At the pieces aimed at, if any other piece is, it is
   * cast at once; so is one cast on oneself. One that needs somebody else, with nobody else aimed at,
   * is held ready instead with the piece as its caster, to be cast by {@link confirm} once its targets
   * are picked.
   *
   * The cast where it was cast at once, `'held'` where it is held ready, and null where nothing came
   * of it. A seat that may not change the table shows nothing on anybody's table, so for it nothing
   * is cast and nothing held ready. A piece that is not on the table casts as it always did and holds
   * nothing ready.
   */
  castFrom(preset: EffectPreset, piece: GameCharacter): EffectCast | 'held' | null {
    if (!this.rolePermission.canEditTabletop()) return null;
    if (
      preset.effectTargeting === 'self' ||
      !this.characterOf(piece.identifier) ||
      this.tabletopService.characters.some(
        (character) => character.isVisibleOnTable && character.targeted && character.identifier !== piece.identifier
      )
    ) {
      return this.castService.fireFromCharacter(preset, piece);
    }

    this.begin(preset);
    this.setCaster(piece.identifier);
    return 'held';
  }

  /**
   * Tells which piece the pointer is over, or that it has left one, for {@link areaProspect}. Leaving
   * a piece the pointer is no longer held to be over changes nothing.
   */
  hoverPiece(identifier: string, over: boolean): void {
    if (over) this._hovered.set(identifier);
    else if (untracked(this._hovered) === identifier) this._hovered.set('');
  }

  /**
   * Waits for the next piece pressed to take it as the caster rather than pick it as a target, or
   * stops waiting. Nothing while no effect is held ready.
   */
  changeCaster(waiting = true): void {
    if (!this.isPicking()) return;
    this._changingCaster.set(waiting);
  }

  /**
   * Fixes the piece the effect held ready is cast from, an empty identifier for none, and stops
   * waiting for one. The piece is no target: it is taken out of the picks if it was among them, and
   * for as long as it is the caster of an effect that needs somebody else no press picks it and no
   * area takes it in.
   *
   * False, with everything left as it was, while no effect is held ready or when the identifier names
   * no piece on the table.
   */
  setCaster(identifier: string): boolean {
    if (!this.isPicking()) return false;
    if (identifier.length > 0 && !this.characterOf(identifier)) return false;

    this._casterIdentifier.set(identifier);
    this._changingCaster.set(false);
    if (identifier.length > 0 && this._picks().includes(identifier)) {
      this._picks.update((picks) => picks.filter((pick) => pick !== identifier));
      this.mirror();
    }
    return true;
  }

  /**
   * Chooses a target, or unchooses it. Filling the limit casts nothing. The caster of an effect that
   * needs somebody else is not chosen, as the centre of an area either.
   */
  pick(identifier: string): void {
    const preset = this._preset();
    if (!preset || this.isCasterKeptOut(identifier)) return;

    const character = this.characterOf(identifier);
    if (!character) return;

    // An area attack rechooses everything it catches in one click.
    // Casting on the gather would leave no chance to see how far it reaches.
    if (preset.areaRadiusCells > 0) {
      this._epicenter.set(identifier);
      this._picks.set(this.areaPicks(preset, character));
      this.mirror();
      return;
    }

    this._picks.set(toggleEffectPick(this._picks(), identifier, preset.targetLimit));
    this.mirror();
  }

  /**
   * Casts the effect being aimed at the pieces picked so far, in pick order, and ends the picking.
   * The pieces cast at stay marked as aimed at, but for an effect cast on oneself, which aims at
   * nothing and leaves the marks as they were before it was held ready.
   *
   * Null, with the picking left as it was, when nothing is being aimed or none of the picked pieces
   * is still on the table.
   */
  confirm(): EffectCast | null {
    const preset = this._preset();
    if (!preset) return null;
    if (!this.rolePermission.canEditTabletop()) {
      this.cancel();
      return null;
    }

    const targets = this._picks()
      .map((identifier) => this.characterOf(identifier))
      .filter((character): character is GameCharacter => character != null);
    if (targets.length < 1) return null;

    const caster = this.characterOf(this._casterIdentifier());
    const shown = untracked(() => [...this.pickOrder().keys()]);
    const cast = this.castService.fire(preset, targets, caster);
    if (preset.effectTargeting === 'self') this.restoreTargets();
    this.reset();
    if (cast) this._lastConfirmed.set({ preset, shown });
    return cast;
  }

  /**
   * Cancels, putting back the targets from before it began as they were, one this reader can no longer
   * see among them, which picking left unmarked.
   */
  cancel(): boolean {
    if (!this.isPicking()) return false;

    this.restoreTargets();
    this.reset();
    return true;
  }

  /** Marks as aimed at exactly the pieces that were before the choosing began. */
  private restoreTargets(): void {
    const before = new Set(this.previousTargets);
    for (const character of this.tabletopService.characters) {
      const next = before.has(character.identifier);
      if (character.targeted === next) continue;
      character.targeted = next;
      this.uiSignalService.notifyTargetChange(character.identifier, character.aliasName);
    }
  }

  private reset(): void {
    this._preset.set(null);
    this._picks.set([]);
    this._casterIdentifier.set('');
    this._epicenter.set('');
    this._changingCaster.set(false);
    this.previousTargets = [];
    this.beganWithSelection = null;
  }

  /**
   * Takes everything within the radius of the centre piece, nearest first. A piece in an engagement
   * zone stands at the zone's centre for this, so a zone the area reaches is reached whole; a piece
   * taken out of the fight is never reached, and neither is the caster of an effect that needs
   * somebody else.
   */
  private areaPicks(preset: EffectPreset, center: GameCharacter): string[] {
    const gridSize = this.tabletopService.gridSize();
    const reading = this.zones.reading();
    const origin = { ...this.centerOf(center, gridSize), ...reading.pointOf(center) };
    const candidates = this.tabletopService.characters
      .filter(
        (character) =>
          character.isVisibleOnTable && character.offField !== '1' && !this.isCasterKeptOut(character.identifier)
      )
      .map((character) => ({
        identifier: character.identifier,
        ...this.centerOf(character, gridSize),
        ...reading.pointOf(character),
      }));

    return effectAreaTargets(origin, candidates, preset.areaRadiusCells * gridSize, preset.targetLimit);
  }

  /**
   * Copies the ordered array onto each piece's `targeted` flag: a piece this reader cannot see is
   * struck all the same but not marked as aimed at, as the mark would name it wherever aims are read,
   * in the chat's lines aimed at targets among them.
   */
  private mirror(): void {
    const picked = new Set(this._picks());
    for (const character of this.tabletopService.characters) {
      const next = picked.has(character.identifier) && this.vision.isTokenVisible(character);
      if (character.targeted === next) continue;
      character.targeted = next;
      this.uiSignalService.notifyTargetChange(character.identifier, character.aliasName);
    }
  }

  /**
   * Whether the piece is the caster of the effect held ready and so no target of it: nobody casts at
   * themselves, but with an effect cast on oneself, whose caster is its target.
   */
  private isCasterKeptOut(identifier: string): boolean {
    const preset = this._preset();
    if (!preset || preset.effectTargeting === 'self') return false;
    return identifier.length > 0 && identifier === this._casterIdentifier();
  }

  private selectedCasterIdentifier(): string {
    const selected = this.selectionSignalService.selectedObject();
    if (!selected) return '';
    return this.characterOf(selected.identifier)?.identifier ?? '';
  }

  private characterOf(identifier: string): GameCharacter | null {
    if (identifier.length < 1) return null;
    const character = this.objectStore.get<GameCharacter>(identifier);
    if (!(character instanceof GameCharacter) || !character.isVisibleOnTable) return null;
    return character;
  }

  private centerOf(character: GameCharacter, gridSize: number): { x: number; y: number; z: number } {
    const half = (gridSize * (character.size > 0 ? character.size : 1)) / 2;
    return { x: character.location.x + half, y: character.location.y + half, z: character.posZ };
  }
}
