import { computed, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  carryPeriodSkies,
  cleanDayFormat,
  cleanPeriods,
  formatGameClockDay,
  formatGameClockTime,
  type GameClock,
  type GameClockMode,
  periodIndexOf,
  type PeriodSkies,
  periodsOf,
  stepGameClock,
  withDay,
  withPeriodSky,
  writeGameClock,
} from '@axe/domain/game-clock/game-clock';
import { Config } from '@axe/domain/peer/config';

/**
 * The time the room keeps in its story, as everyone sees it and as the game master moves it.
 *
 * A step the master takes on or back is said in the chat where the room wants it said; setting the
 * clock up, or putting it to a day by hand, is not.
 */
@Injectable({ providedIn: 'root' })
export class GameClockService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly permission = inject(RolePermissionService);
  private readonly chat = inject(ChatMessageService);
  private readonly language = inject(LanguageService);
  private readonly t = inject(TRANSLATE_FN);

  readonly clock = computed<GameClock>(() => {
    this.objectChange.versionOf(Config.instance.identifier)();
    return Config.instance.gameClock;
  });

  /** The hour each part of the day's sky is drawn at, as the room chose it. */
  readonly skies = computed<PeriodSkies>(() => {
    this.objectChange.versionOf(Config.instance.identifier)();
    return Config.instance.gameClockSkies;
  });

  /** Whether this seat moves the clock and sets it up, which only the game master does. */
  readonly canEdit = computed(() => this.permission.isGameMaster());

  /** The parts of a day the reader's language has, which the clock is told by where the room names none. */
  private readonly defaultPeriods = computed<readonly string[]>(() => {
    this.language.currentLang();
    return cleanPeriods(this.t('feature.gameClock.defaultPeriods').split(','));
  });

  /** The parts of a day the clock is told by: the room's, else the reader's language's own. */
  readonly periods = computed<readonly string[]>(() => periodsOf(this.clock(), this.defaultPeriods()));

  readonly dayText = computed(() => {
    this.language.currentLang();
    return formatGameClockDay(this.clock(), this.t('feature.gameClock.dayFormat'));
  });

  readonly timeText = computed(() => formatGameClockTime(this.clock(), this.periods()));

  /**
   * Moves the clock on a step, or back one, and says so in the chat where the room wants it said;
   * back from the very start, where it goes nowhere, it says nothing.
   */
  step(direction: 1 | -1): void {
    if (!this.canEdit()) return;
    const clock = this.clock();
    const next = stepGameClock(clock, direction, this.periods().length);
    if (writeGameClock(next) === writeGameClock(clock)) return;
    this.write(next);
    if (!next.announce) return;
    const key = direction > 0 ? 'feature.gameClock.announceOn' : 'feature.gameClock.announceBack';
    this.chat.sendSystemNotice('clock', this.t(key, { day: this.dayText(), time: this.timeText() }));
  }

  /** Puts the clock to another day, the hour of it left as it was. */
  setDay(day: number): void {
    if (this.canEdit()) this.write(withDay(this.clock(), day));
  }

  /**
   * Puts the clock to one of the parts of the day, by its place among them. A scene put on by a
   * switch the master set up does so for whoever pressed it, `trusted`; a clock told by the hour
   * on a 24-hour face is then left alone, as it has no parts.
   */
  setPeriod(period: number, options: { trusted?: boolean } = {}): void {
    if (!this.canEdit() && !options.trusted) return;
    if (options.trusted && this.clock().mode !== 'periods') return;
    const count = this.periods().length;
    this.write({ ...this.clock(), period: Math.max(0, Math.min(count - 1, Math.floor(period))) });
  }

  /** Puts the clock to a time of day, in minutes past midnight. */
  setMinutes(minutes: number): void {
    if (!this.canEdit() || !Number.isFinite(minutes)) return;
    this.write({ ...this.clock(), minutes: Math.max(0, Math.min(24 * 60 - 1, Math.floor(minutes))) });
  }

  setMode(mode: GameClockMode): void {
    if (this.canEdit()) this.write({ ...this.clock(), mode });
  }

  /**
   * Names the parts of a day from a list written with commas between them; an empty one goes back to
   * the language's own. The part it is now stays, unless there are no longer as many parts, and each
   * part keeps the sky it was drawn with, as {@link carryPeriodSkies} carries it over.
   */
  setPeriods(written: string): void {
    if (!this.canEdit()) return;
    const clock = { ...this.clock(), periods: cleanPeriods(written.split(/[,、，]/)) };
    const periods = periodsOf(clock, this.defaultPeriods());
    Config.instance.gameClockSkies = carryPeriodSkies(this.skies(), this.periods(), periods);
    this.write({ ...clock, period: periodIndexOf(clock, periods.length) });
  }

  /** Draws the sky of one part of the day, by its place among them, at an hour; null lays it evenly again. */
  setSky(index: number, hour: number | null): void {
    if (!this.canEdit()) return;
    Config.instance.gameClockSkies = withPeriodSky(this.skies(), index, hour);
    this.objectChange.notifyChanged(Config.instance.identifier);
  }

  setStep(step: number): void {
    if (this.canEdit()) this.write({ ...this.clock(), step });
  }

  /** Sets how the day is written, `{n}` standing for its number; one without it goes back to the language's own. */
  setDayFormat(format: string): void {
    if (this.canEdit()) this.write({ ...this.clock(), dayFormat: cleanDayFormat(format) });
  }

  setAnnounce(announce: boolean): void {
    if (this.canEdit()) this.write({ ...this.clock(), announce });
  }

  private write(clock: GameClock): void {
    Config.instance.gameClock = clock;
    this.objectChange.notifyChanged(Config.instance.identifier);
  }
}
