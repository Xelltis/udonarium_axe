import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { SelectionSignalService, TabletopObjectSelection } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { TargetArrowGeometry, targetArrowGeometry } from '@axe/domain/card/target-arrow';
import { GameCharacter } from '@axe/domain/character/game-character';
import { effectAreaTargets } from '@axe/domain/effect/effect-area';
import { EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectPickOrder, reachedEffectPickLimit, toggleEffectPick } from '@axe/domain/effect/effect-target-picks';

/** The order mark shown on a chosen piece. */
export interface EffectTargetMark {
  identifier: string;
  order: number;
  x: number;
  y: number;
  z: number;
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
 */
@Injectable({ providedIn: 'root' })
export class EffectTargetingService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly castService = inject(EffectCastService);

  private readonly _preset = signal<EffectPreset | null>(null);
  private readonly _picks = signal<readonly string[]>([]);
  private readonly _casterIdentifier = signal('');
  private readonly _epicenter = signal('');

  readonly preset = this._preset.asReadonly();
  readonly picks = this._picks.asReadonly();
  readonly casterIdentifier = this._casterIdentifier.asReadonly();
  /** The piece chosen as the centre of an area attack. */
  readonly epicenter = this._epicenter.asReadonly();

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
  readonly limit = computed(() => this._preset()?.targetLimit ?? 0);

  /** The targets from before the choosing began, restored on cancel. */
  private previousTargets: readonly string[] = [];
  /** The pieces already chosen at the start, which do not count as chosen again. */
  private beganWithSelection: TabletopObjectSelection | null = null;

  readonly marks = computed<EffectTargetMark[]>(() => {
    if (!this.isPicking()) return [];
    this.objectChange.collectionOf('character')();

    const gridSize = this.tabletopService.gridSize();
    const marks: EffectTargetMark[] = [];
    for (const identifier of this._picks()) {
      const character = this.characterOf(identifier);
      if (!character) continue;
      this.objectChange.versionOf(identifier)();
      marks.push({
        identifier,
        order: effectPickOrder(this._picks(), identifier),
        ...this.centerOf(character, gridSize),
      });
    }
    return marks;
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
      untracked(() => this.pick(selected.identifier));
    });
  }

  /**
   * Begins choosing. It inherits whatever is already named, so a target set from the
   * remote or from chat can be cast at straight away.
   */
  begin(preset: EffectPreset): void {
    const targeted = this.tabletopService.characters
      .filter((character) => character.isVisibleOnTable && character.targeted)
      .map((character) => character.identifier);

    this.previousTargets = targeted;
    this.beganWithSelection = untracked(this.selectionSignalService.selectedObject);
    this._preset.set(preset);
    this._picks.set(targeted.slice(0, Math.max(preset.targetLimit, 1)));
    // The shooter is the selected piece, caught at the start because choosing moves the selection onto the targets.
    this._casterIdentifier.set(this.selectedCasterIdentifier());
    this.mirror();
  }

  /** Chooses a target, or unchooses it. Reaching the limit casts. */
  pick(identifier: string): EffectCast | null {
    const preset = this._preset();
    if (!preset) return null;

    const character = this.characterOf(identifier);
    if (!character) return null;

    // An area attack rechooses everything it catches in one click.
    // Casting on the gather would leave no chance to see how far it reaches.
    if (preset.areaRadiusCells > 0) {
      this._epicenter.set(identifier);
      this._picks.set(this.areaPicks(preset, character));
      this.mirror();
      return null;
    }

    const before = this._picks();
    const after = toggleEffectPick(before, identifier, preset.targetLimit);
    this._picks.set(after);
    this.mirror();

    if (!reachedEffectPickLimit(before, after, preset.targetLimit)) return null;
    return this.confirm();
  }

  /**
   * Casts the effect being aimed at the pieces picked so far, in pick order, and ends the picking.
   *
   * Null, with the picking left as it was, when nothing is being aimed or none of the picked pieces
   * is still on the table.
   */
  confirm(): EffectCast | null {
    const preset = this._preset();
    if (!preset) return null;

    const targets = this._picks()
      .map((identifier) => this.characterOf(identifier))
      .filter((character): character is GameCharacter => character != null);
    if (targets.length < 1) return null;

    const caster = this.characterOf(this._casterIdentifier());
    const cast = this.castService.fire(preset, targets, caster);
    this.reset();
    return cast;
  }

  /** Cancels, putting back the targets from before it began. */
  cancel(): boolean {
    if (!this.isPicking()) return false;

    this._picks.set(this.previousTargets);
    this.mirror();
    this.reset();
    return true;
  }

  private reset(): void {
    this._preset.set(null);
    this._picks.set([]);
    this._casterIdentifier.set('');
    this._epicenter.set('');
    this.previousTargets = [];
    this.beganWithSelection = null;
  }

  /** Takes everything within the radius of the centre piece, nearest first. */
  private areaPicks(preset: EffectPreset, center: GameCharacter): string[] {
    const gridSize = this.tabletopService.gridSize();
    const origin = this.centerOf(center, gridSize);
    const candidates = this.tabletopService.characters
      .filter((character) => character.isVisibleOnTable)
      .map((character) => ({ identifier: character.identifier, ...this.centerOf(character, gridSize) }));

    return effectAreaTargets(origin, candidates, preset.areaRadiusCells * gridSize, preset.targetLimit);
  }

  /** Copies the ordered array onto each piece's `targeted` flag. */
  private mirror(): void {
    const picked = new Set(this._picks());
    for (const character of this.tabletopService.characters) {
      const next = picked.has(character.identifier);
      if (character.targeted === next) continue;
      character.targeted = next;
      this.uiSignalService.notifyTargetChange(character.identifier, character.aliasName);
    }
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
