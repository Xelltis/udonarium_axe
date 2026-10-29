import { inject, Injectable } from '@angular/core';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { callBattleCutIn } from '@axe/core/event/domain-events';
import { generateUuid } from '@axe/core/util/uuid';
import { defaultBlowEffectIdentifier } from '@axe/domain/battle/battle-blow';
import { DefeatRule, fighterBetween } from '@axe/domain/battle/battle-fighter';
import { attackerSideFor, BattleBout, lineupBout, LineupMember } from '@axe/domain/battle/battle-lineup';
import { readFighter, readingsDiffer } from '@axe/domain/battle/battle-reading';
import { BattleScene, MAX_BATTLE_DEFENDERS } from '@axe/domain/battle/battle-scene';
import { DEFAULT_DEFEAT_EFFECT_IDENTIFIER } from '@axe/domain/battle/battle-settings';
import { standingBattleSide } from '@axe/domain/battle/battle-side';
import { BattleRequest, BattleTake, takeBattle } from '@axe/domain/battle/battle-take';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { Config } from '@axe/domain/peer/config';
import { TurnState } from '@axe/domain/tabletop/turn-state';

/**
 * As long as a bout waits for the numbers a line is moving to reach the pieces, which takes the
 * longest the first time a game system's dice are fetched.
 */
export const BATTLE_CHANGE_WAIT_MS = 5000;
/** How long a bout waits after the first number moves, for the rest of the change to land. */
export const BATTLE_CHANGE_SETTLE_MS = 200;

/** Where a scene is played: for the whole room, or on this screen alone. */
export type BattleAudience = 'everywhere' | 'here';

/**
 * Plays exchanges on the battle stage.
 *
 * The seat that plays a bout reads the pieces before and after the numbers move and sends the
 * whole scene, so every screen draws the same fall of the bars whenever the change reaches it,
 * and nothing has to be worked out again at the other end.
 */
@Injectable({ providedIn: 'root' })
export class BattleLaunchService {
  private readonly tabletop = inject(TabletopService);
  private readonly library = inject(EffectLibraryService);
  private readonly objectChange = inject(ObjectChangeService);

  /**
   * The pieces out on the table that stand on a side, put there or standing with their party, in
   * the order the table holds them.
   */
  lineup(): LineupMember[] {
    const members: LineupMember[] = [];
    for (const character of this.tabletop.characters) {
      const side = standingBattleSide(character);
      if (side && character.isVisibleOnTable) members.push({ identifier: character.identifier, side });
    }
    return members;
  }

  /**
   * The bout the lineup plays now: whose turn it is strikes if they stand in it, then the piece
   * given, then the first on the left.
   */
  lineupBout(also: GameCharacter | null = null): BattleBout | null {
    return lineupBout(this.lineup(), [TurnState.instance.currentIdentifier, also?.identifier], MAX_BATTLE_DEFENDERS);
  }

  /** Plays the lineup, as {@link lineupBout} picks the bout. Null where the lineup has no bout to play. */
  playLineup(also: GameCharacter | null, audience: BattleAudience): BattleScene | null {
    const bout = this.lineupBout(also);
    return bout ? this.playBout(bout, audience) : null;
  }

  /**
   * Plays the lineup with this piece striking everybody across from it, whoever's turn it is. Null
   * where the piece stands in no side, or nobody stands across from it.
   */
  playLineupAs(attacker: GameCharacter, audience: BattleAudience): BattleScene | null {
    const members = this.lineup();
    if (!members.some((member) => member.identifier === attacker.identifier)) return null;
    const bout = lineupBout(members, [attacker.identifier], MAX_BATTLE_DEFENDERS);
    return bout ? this.playBout(bout, audience) : null;
  }

  private playBout(bout: BattleBout, audience: BattleAudience): BattleScene | null {
    const attacker = this.characterOf(bout.attacker);
    const defenders = bout.defenders.map((identifier) => this.characterOf(identifier)).filter(isCharacter);
    if (!attacker) return null;
    return this.play({ attacker, defenders, attackerSide: bout.attackerSide }, audience);
  }

  /** Plays a bout as the pieces stand, with nothing moving. */
  play(request: BattleRequest, audience: BattleAudience): BattleScene | null {
    return this.finish(this.take(request), audience);
  }

  /** Reads the pieces of a bout as they stand, before a change is made to them. */
  take(request: BattleRequest): BattleTake {
    return takeBattle(request);
  }

  /**
   * Plays a bout that was taken before a change, against how the pieces stand now. Null where
   * nobody is left to be struck.
   */
  finish(take: BattleTake, audience: BattleAudience = 'everywhere'): BattleScene | null {
    const scene = this.sceneOf(take);
    if (scene) callBattleCutIn(scene, audience);
    return scene;
  }

  /**
   * Plays a bout once the change under way has reached its pieces: it waits for any of their
   * numbers to have moved and a moment more for the rest of the change, or gives up waiting after a
   * while and plays the pieces as they stand. Something touching the numbers without moving them
   * is not taken for the change.
   */
  finishAfterChange(take: BattleTake, audience: BattleAudience = 'everywhere'): Promise<BattleScene | null> {
    const watched = [...take.before.values()].flatMap((reading) => [...reading.resources.keys()]);
    const pieces = [take.request.attacker, ...take.request.defenders];
    const moved = () =>
      pieces.some((piece) => {
        const before = take.before.get(piece.identifier);
        return before !== undefined && readingsDiffer(before, readFighter(piece));
      });
    return new Promise((resolve) => {
      let settle: ReturnType<typeof setTimeout> | undefined;
      const done = () => {
        stop();
        clearTimeout(settle);
        clearTimeout(giveUp);
        resolve(this.finish(take, audience));
      };
      const stop = this.objectChange.onObjectChangedFor(
        () => watched,
        () => {
          clearTimeout(settle);
          settle = setTimeout(() => {
            if (moved()) done();
          }, BATTLE_CHANGE_SETTLE_MS);
        }
      );
      const giveUp = setTimeout(done, BATTLE_CHANGE_WAIT_MS);
    });
  }

  private sceneOf(take: BattleTake): BattleScene | null {
    const { request } = take;
    const settings = Config.instance.battleSettings;
    const rule: DefeatRule = { enabled: settings.defeat, resource: settings.defeatResource };
    const fighter = (character: GameCharacter) => {
      const after = readFighter(character);
      return fighterBetween(take.before.get(character.identifier) ?? after, after, rule);
    };

    const struck = request.defenders
      .filter((defender) => defender.identifier !== request.attacker.identifier)
      .slice(0, MAX_BATTLE_DEFENDERS);
    if (struck.length < 1) return null;
    const defenders = struck.map(fighter);

    return {
      key: generateUuid(),
      attackerSide:
        request.attackerSide ??
        attackerSideFor(
          standingBattleSide(request.attacker),
          struck.map((defender) => standingBattleSide(defender))
        ),
      attacker: fighter(request.attacker),
      defenders,
      effect: this.blowEffectOf(request) ?? this.presetOf(defaultBlowEffectIdentifier(defenders)),
      defeatEffect: settings.defeat ? this.defeatEffectOf(settings.defeatEffect) : '',
      background: settings.background,
      theme: settings.theme,
      secret: request.secret === true,
      seed: Math.floor(Math.random() * 0xffffffff),
    };
  }

  /**
   * The effect named for the blow, then the one the piece striking was given, by identifier.
   * Null where neither names one the room has.
   *
   * The line's own is looked up as anything named in the chat is, so a player cannot reach an
   * effect kept to the master. The piece's own was set by whoever looks after the piece, and is
   * found whoever plays the bout.
   */
  private blowEffectOf(request: BattleRequest): string | null {
    const named = request.effectName?.trim() ?? '';
    if (named.length > 0) {
      const found = this.library.findByName(named);
      if (found) return found.identifier;
    }
    const own = request.attacker.battleEffect.trim();
    if (own.length < 1) return null;
    return this.library.presets().find((preset) => preset.name.trim() === own)?.identifier ?? null;
  }

  /** The effect a fighter goes down with: the one the room names, else the built-in crumbling. */
  private defeatEffectOf(name: string): string {
    const named = name.trim();
    const found = named.length > 0 ? this.library.presets().find((preset) => preset.name.trim() === named) : null;
    return found?.identifier ?? this.presetOf(DEFAULT_DEFEAT_EFFECT_IDENTIFIER);
  }

  /** The identifier, where the room still has the preset. Empty where it was taken out of the room. */
  private presetOf(identifier: string): string {
    return this.library.get(identifier) instanceof EffectPreset ? identifier : '';
  }

  private characterOf(identifier: string): GameCharacter | null {
    return this.tabletop.characters.find((character) => character.identifier === identifier) ?? null;
  }
}

function isCharacter(character: GameCharacter | null): character is GameCharacter {
  return character !== null;
}
