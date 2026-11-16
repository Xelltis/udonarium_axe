import { computed, DestroyRef, effect, signal, untracked } from '@angular/core';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { callResourceChange, resourceChange$ } from '@axe/core/event/domain-events';
import { getPeerContext } from '@axe/core/network/peer-context-source';
import { VolumeType } from '@axe/core/storage/audio-output';
import { GameCharacter } from '@axe/domain/character/game-character';
import { isGaugeInverted } from '@axe/domain/character/piece-gauge';
import { isResourceElement } from '@axe/domain/character/resource-catalog';
import {
  diffResourceSnapshots,
  loudestChange,
  ResourceChange,
  ResourceChangeKind,
  ResourceChangeSeverity,
  resourceChangeSeverity,
  ResourceSnapshot,
} from '@axe/domain/character/resource-change';
import {
  playsEffectOnChange,
  playsSoundOnChange,
  ResourceSoundSet,
  soundSetOnChange,
} from '@axe/domain/character/resource-feedback';
import { DataElement } from '@axe/domain/data/data-element';
import { collectDataElements } from '@axe/domain/data/data-element-tree';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';

type PresetSoundKey = Exclude<keyof typeof PresetSound, 'prototype'>;

const RESOURCE_CHANGE_SOUND_KEYS: Record<
  ResourceSoundSet,
  Record<ResourceChangeKind, Record<ResourceChangeSeverity, PresetSoundKey>>
> = {
  flesh: {
    damage: { small: 'damageSmall', medium: 'damageMedium', large: 'damageLarge' },
    heal: { small: 'healSmall', medium: 'healMedium', large: 'healLarge' },
  },
  mech: {
    damage: { small: 'mechDamageSmall', medium: 'mechDamageMedium', large: 'mechDamageLarge' },
    heal: { small: 'mechHealSmall', medium: 'mechHealMedium', large: 'mechHealLarge' },
  },
};

function resourceChangeSound(kind: ResourceChangeKind, ratio: number, soundSet: ResourceSoundSet): string {
  return PresetSound[RESOURCE_CHANGE_SOUND_KEYS[soundSet][kind][resourceChangeSeverity(ratio)]];
}

const FLOATING_CHANGE_MS = 1300;
const FLOATING_CHANGE_LIMIT = 6;
const HIT_FLASH_MS = 420;
const HEAL_AURA_MS = 760;

/** What the display of a piece's resource changes reads of the piece and asks of the table. */
export interface PieceResourceChangesHost {
  /** The piece the changes are shown over, read as a signal; nothing before one is bound. */
  character(): GameCharacter | null | undefined;
  /** The parts drawn as the piece's body, read so that a part joining or leaving is followed. */
  partsOf(character: GameCharacter): readonly GameCharacter[];
  /** The data elements under a root, read through their versions so a change to any is followed; null without a root. */
  followedTree(root: DataElement | null): DataElement[] | null;
  /** How many times this end has changed an element, which tells its own change from one that came in. */
  localChangeCountOf(identifier: string): number;
  /** How a part is named over its body where a change to it is shown. */
  partNameOf(identifier: string): string;
  /** Plays the effects the changes ask for over the piece. */
  playEffects(character: GameCharacter, changes: readonly ResourceChange[]): void;
  /** Ends the display with the piece's component. */
  readonly destroyRef: DestroyRef;
}

/**
 * The rise and fall of a piece's resources as it is shown over the piece: the numbers that float
 * up, the flash of a hit or a heal, and the sound and effect that go with them.
 *
 * A change this end made is drawn as it is found and told to the room; one another end made is
 * drawn on word from it. Watching for the difference at each end would count a value replaced by a
 * load or a sync as a change. A part's change is shown on its body, under the part's name as each
 * seat is shown it.
 *
 * Made where effects can be made, as the piece's component makes its fields.
 */
export class PieceResourceChanges {
  /**
   * The resources of the piece and of its parts, as they stand: a part is drawn as its body, so a
   * blow to a part is shown on the body, as one to the body is.
   */
  readonly snapshot = computed<Map<string, ResourceSnapshot>>(() => {
    const snapshot = new Map<string, ResourceSnapshot>();
    const char = this.host.character();
    const elements = this.host.followedTree(char?.detailDataElement ?? null);
    if (elements === null || !char) return snapshot;

    for (const piece of [char, ...this.host.partsOf(char)]) {
      const own = piece === char ? elements : this.host.followedTree(piece.detailDataElement ?? null);
      for (const element of own ?? []) {
        if (!isResourceElement(element)) continue;
        snapshot.set(element.identifier, {
          current: Number(element.currentValue),
          max: Number(element.value),
          inverted: isGaugeInverted(element),
          playsEffect: playsEffectOnChange(element),
          playsSound: playsSoundOnChange(element),
          soundSet: soundSetOnChange(element),
          changedBySelf: this.host.localChangeCountOf(element.identifier),
        });
      }
    }
    return snapshot;
  });

  /** The names of the resources of the piece and of its parts, and the part each of the latter is of. */
  private readonly names = computed(() => {
    const char = this.host.character();
    const names = new Map<string, { name: string; part: string }>();
    if (!char) return names;
    for (const piece of [char, ...this.host.partsOf(char)]) {
      const detail = piece.detailDataElement;
      if (!detail) continue;
      const part = piece === char ? '' : piece.identifier;
      for (const element of collectDataElements(detail)) names.set(element.identifier, { name: element.name, part });
    }
    return names;
  });

  /** The changes floating over the piece now, oldest first. */
  readonly floating = signal<(ResourceChange & { key: number })[]>([]);
  /** The flash the piece is drawn with for a moment after a hit or a heal; null between them. */
  readonly hitFlash = transientSignal<'damage' | 'heal' | null>(null, HIT_FLASH_MS);

  private previous: Map<string, ResourceSnapshot> | null = null;
  private floatingKey = 0;
  private readonly floatingTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly host: PieceResourceChangesHost) {
    effect(() => {
      const snapshot = this.snapshot();
      const previous = this.previous;
      this.previous = snapshot;
      if (!previous) return;

      const names = untracked(this.names);
      const changes = diffResourceSnapshots(previous, snapshot, (identifier) => names.get(identifier)?.name ?? '').map(
        (change) => {
          const part = names.get(change.identifier)?.part ?? '';
          return part ? { ...change, part } : change;
        }
      );
      if (changes.length < 1) return;

      const character = untracked(() => this.host.character());
      if (!character) return;
      untracked(() => this.show(changes));
      callResourceChange({ characterIdentifier: character.identifier, changes });
    });

    resourceChange$.subscribe((event) => {
      if (event.emittedBy === getPeerContext().peerId) return;
      if (event.characterIdentifier !== this.host.character()?.identifier) return;
      this.show(event.changes as ResourceChange[]);
    }, host.destroyRef);

    host.destroyRef.onDestroy(() => {
      for (const timer of this.floatingTimers) clearTimeout(timer);
      this.floatingTimers.clear();
    });
  }

  /**
   * Draws changes over the piece for a while, with the flash, the sound and the effects they ask for.
   *
   * One line is heard, the loudest, and its kind, its size and its voice all come from it: taken
   * apart, a point of damage alongside a large heal would play as a large hurt in the heal's voice.
   */
  private show(changes: ResourceChange[]): void {
    const entries = changes.map((change) => ({
      ...change,
      label: change.part ? `${this.host.partNameOf(change.part)} ${change.label}` : change.label,
      key: ++this.floatingKey,
    }));
    this.floating.update((current) => [...current, ...entries].slice(-FLOATING_CHANGE_LIMIT));

    const kind = entries.some((entry) => entry.kind === 'damage') ? 'damage' : 'heal';
    this.hitFlash.show(kind, kind === 'damage' ? HIT_FLASH_MS : HEAL_AURA_MS);

    const heard = entries.filter((entry) => entry.playsSound);
    const loudest = loudestChange(heard);
    if (loudest) {
      SoundEffect.playLocal(resourceChangeSound(loudest.kind, loudest.ratio, loudest.soundSet), VolumeType.EFFECT);
    }

    const shown = entries.filter((entry) => entry.playsEffect);
    const char = this.host.character();
    if (char && shown.length > 0) this.host.playEffects(char, shown);

    const keys = new Set(entries.map((entry) => entry.key));
    const floatTimer = setTimeout(() => {
      this.floatingTimers.delete(floatTimer);
      this.floating.update((current) => current.filter((entry) => !keys.has(entry.key)));
    }, FLOATING_CHANGE_MS);
    this.floatingTimers.add(floatTimer);
  }
}
