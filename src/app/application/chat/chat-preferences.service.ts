import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  ChatSoundSetting,
  clampChatSoundVolume,
  DEFAULT_CHAT_SOUND,
  DEFAULT_CHAT_SOUND_TYPE,
  isChatSoundType,
} from '@axe/domain/chat/chat-sound';

const AUTO_FOLLOW_KEY = 'chat-auto-follow-scroll';
const STORAGE_KEY = 'chat-preferences';

export const CHAT_FONT_SIZE_DEFAULT = 13;
export const CHAT_FONT_SIZE_MIN = 10;
export const CHAT_FONT_SIZE_MAX = 24;

const TAB_PREFERENCE_LIMIT = 64;

export interface ChatDisplayPreferences {
  portraitHeight: number;
  isPortraitInWindow: boolean;
  isKeepPortraitOutWindow: boolean;
  simpleDispFlagTime: number;
  simpleDispFlagUserId: number;
}

export interface ChatTabPreferences {
  portraitDisplayFlag: number;
  chatSimpleDispFlag: number;
}

/** Whether a display setting is one answer for the room or an answer per tab. */
export type ChatSettingScope = 'all' | 'perTab';

export interface ChatScopedSetting {
  scope: ChatSettingScope;
  /** The answer used everywhere while the scope is 'all'. */
  all: number;
}

const DEFAULT_PORTRAIT: ChatScopedSetting = { scope: 'all', all: 1 };
const DEFAULT_SIMPLE: ChatScopedSetting = { scope: 'all', all: 0 };

/**
 * What a reader hears when somebody speaks, either once for the room or tab by tab.
 *
 * This is the reader's own ear, so it is never sent anywhere: two people at one table can
 * hear different things, or nothing at all.
 */
export interface ChatScopedSoundSetting {
  scope: ChatSettingScope;
  all: ChatSoundSetting;
  tabs: Record<string, ChatSoundSetting>;
}

const DEFAULT_SOUND: ChatScopedSoundSetting = { scope: 'all', all: DEFAULT_CHAT_SOUND, tabs: {} };

interface StoredChatPreferences {
  fontSize?: number;
  /** Whether the chat log says how novel mode was asked to stage a line. Off unless asked for. */
  showVnEmoteBadge?: boolean;
  colors?: string[];
  display?: ChatDisplayPreferences;
  portrait?: ChatScopedSetting;
  simple?: ChatScopedSetting;
  sound?: ChatScopedSoundSetting;
  /**
   * What each tab was set to, under the tab's name.
   *
   * A room loaded from a file makes its tabs afresh under new identifiers, and a reader's own
   * settings should not be lost with them. Two tabs of one name share an answer, which is a
   * fair trade for settings that survive the room being passed around.
   */
  tabs?: Record<string, ChatTabPreferences>;
}

@Injectable({ providedIn: 'root' })
export class ChatPreferencesService {
  private readonly document = inject(DOCUMENT);

  readonly autoFollowScroll = signal<boolean>(readAutoFollow());

  private readonly stored = signal<StoredChatPreferences>(readStored());

  readonly fontSize = computed(() => clampFontSize(this.stored().fontSize ?? CHAT_FONT_SIZE_DEFAULT));
  readonly colors = computed<readonly string[] | null>(() => this.stored().colors ?? null);
  readonly display = computed<ChatDisplayPreferences | null>(() => this.stored().display ?? null);
  readonly portrait = computed<ChatScopedSetting>(() => this.stored().portrait ?? DEFAULT_PORTRAIT);
  readonly simple = computed<ChatScopedSetting>(() => this.stored().simple ?? DEFAULT_SIMPLE);

  /**
   * Whether this reader ever answered at all.
   *
   * A tab's setting is shared with the room, so a reader with nothing of their own to say
   * must say nothing: joining with an empty store would otherwise write the defaults onto
   * every tab and hand them to everybody else.
   */
  readonly hasPortraitAnswer = computed(() => this.stored().portrait !== undefined);
  readonly hasSimpleAnswer = computed(() => this.stored().simple !== undefined);
  readonly sound = computed<ChatScopedSoundSetting>(() => this.stored().sound ?? DEFAULT_SOUND);

  /**
   * Whether a line says which novel-mode expression it was sent with.
   *
   * Off by default: a serious scene reads worse for "ぶるぶる" standing beside it, and a log
   * kept for the table reads worse still. Somebody who wants to tell at a glance can turn it
   * on, and it stays on this browser rather than being handed to the room.
   */
  readonly showVnEmoteBadge = computed(() => this.stored().showVnEmoteBadge === true);

  constructor() {
    effect(() => {
      const v = this.autoFollowScroll();
      write(AUTO_FOLLOW_KEY, v ? '1' : '0');
    });

    effect(() => {
      write(STORAGE_KEY, JSON.stringify(this.stored()));
    });

    effect(() => {
      this.document.documentElement.style.setProperty('--chat-font-size', `${this.fontSize()}px`);
    });
  }

  /** Whether the log scrolls to each new line as it arrives. Kept in this browser only. */
  setAutoFollowScroll(v: boolean): void {
    this.autoFollowScroll.set(v);
  }

  /** Turns the novel-mode expression badge on lines on or off for this reader. */
  setShowVnEmoteBadge(v: boolean): void {
    this.patch({ showVnEmoteBadge: v });
  }

  /** Sets the chat text size, clamped to the allowed range; anything not a number falls back to the default. */
  setFontSize(v: number): void {
    this.patch({ fontSize: clampFontSize(v) });
  }

  /** Remembers the colours this reader speaks in, in this browser. */
  setColors(colors: readonly string[]): void {
    this.patch({ colors: colors.map((c) => String(c)) });
  }

  /** Remembers how the chat window lays out portraits and the short form of lines, in this browser. */
  setDisplay(display: ChatDisplayPreferences): void {
    this.patch({ display: { ...display } });
  }

  /**
   * Records whether portraits show, and whether that is one answer for the room or one per tab.
   *
   * Once this is set the reader counts as having answered; see `hasPortraitAnswer`.
   */
  setPortrait(setting: ChatScopedSetting): void {
    this.patch({ portrait: { ...setting } });
  }

  /**
   * Records whether lines show in their short form, and whether that is one answer or one per tab.
   *
   * Once this is set the reader counts as having answered; see `hasSimpleAnswer`.
   */
  setSimple(setting: ChatScopedSetting): void {
    this.patch({ simple: { ...setting } });
  }

  /** Replaces what this reader hears when a line arrives, for the room or tab by tab. Never sent anywhere. */
  setSound(setting: ChatScopedSoundSetting): void {
    this.patch({ sound: { scope: setting.scope, all: { ...setting.all }, tabs: { ...setting.tabs } } });
  }

  /** What a tab of this name is set to, falling back to the one answer for the room. */
  soundOfTab(name: string): ChatSoundSetting {
    const setting = this.sound();
    if (setting.scope === 'all') return setting.all;
    return setting.tabs[name] ?? setting.all;
  }

  /** Sets the sound for the tab of this name, which is only heard while the sound is set per tab. */
  setSoundOfTab(name: string, sound: ChatSoundSetting): void {
    const setting = this.sound();
    this.setSound({ ...setting, tabs: { ...setting.tabs, [name]: { ...sound } } });
  }

  /**
   * Tabs are remembered by name; see the note on the stored shape.
   *
   * They were once remembered by identifier, so an answer stored under one is taken as the
   * answer for the tab that still carries it, and written back under the name from then on.
   */
  tabPreferencesOf(name: string, identifier?: string): ChatTabPreferences | null {
    const tabs = this.stored().tabs;
    if (!tabs) return null;
    const byName = tabs[name];
    if (byName) return byName;
    const byIdentifier = identifier ? tabs[identifier] : undefined;
    if (!byIdentifier) return null;
    this.setTabPreferences(name, byIdentifier);
    return byIdentifier;
  }

  /**
   * Remembers a tab's portrait and short-form settings under its name.
   *
   * The most recently written tabs are kept and the oldest are dropped once there are more than 64.
   */
  setTabPreferences(name: string, preferences: ChatTabPreferences): void {
    this.stored.update((current) => {
      const tabs: Record<string, ChatTabPreferences> = { ...current.tabs };
      delete tabs[name];
      tabs[name] = { ...preferences };
      const keys = Object.keys(tabs);
      for (const stale of keys.slice(0, Math.max(0, keys.length - TAB_PREFERENCE_LIMIT))) delete tabs[stale];
      return { ...current, tabs };
    });
  }

  private patch(part: StoredChatPreferences): void {
    this.stored.update((current) => ({ ...current, ...part }));
  }
}

function clampFontSize(v: number): number {
  if (!Number.isFinite(v)) return CHAT_FONT_SIZE_DEFAULT;
  return Math.min(CHAT_FONT_SIZE_MAX, Math.max(CHAT_FONT_SIZE_MIN, Math.round(v)));
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage unavailable (private mode, SSR etc) — silently ignore */
  }
}

function readAutoFollow(): boolean {
  try {
    const v = localStorage.getItem(AUTO_FOLLOW_KEY);
    return v == null ? true : v === '1';
  } catch {
    return true;
  }
}

function readStored(): StoredChatPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const source = parsed as Record<string, unknown>;
    const stored: StoredChatPreferences = {};
    if (typeof source['fontSize'] === 'number') stored.fontSize = clampFontSize(source['fontSize']);
    if (source['showVnEmoteBadge'] === true) stored.showVnEmoteBadge = true;
    const colors = readColors(source['colors']);
    if (colors) stored.colors = colors;
    const display = readDisplay(source['display']);
    if (display) stored.display = display;
    const tabs = readTabs(source['tabs']);
    if (tabs) stored.tabs = tabs;
    // A reader from before the scope was asked about kept an answer per tab, and meant it.
    // A reader who kept nothing at all is left with nothing, and writes on no tab.
    const portrait = readScoped(source['portrait']) ?? (stored.tabs ? { ...DEFAULT_PORTRAIT, scope: 'perTab' } : null);
    if (portrait) stored.portrait = portrait;
    const simple = readScoped(source['simple']) ?? (stored.tabs ? { ...DEFAULT_SIMPLE, scope: 'perTab' } : null);
    if (simple) stored.simple = simple;
    const sound = readScopedSound(source['sound']);
    if (sound) stored.sound = sound;
    return stored;
  } catch {
    /* corrupt or unavailable storage — start from the defaults */
    return {};
  }
}

function readColors(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const colors = value.filter((c): c is string => typeof c === 'string');
  return colors.length > 0 ? colors : null;
}

function readDisplay(value: unknown): ChatDisplayPreferences | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const portraitHeight = source['portraitHeight'];
  const simpleDispFlagTime = source['simpleDispFlagTime'];
  const simpleDispFlagUserId = source['simpleDispFlagUserId'];
  if (typeof portraitHeight !== 'number') return null;
  return {
    portraitHeight,
    isPortraitInWindow: source['isPortraitInWindow'] === true,
    isKeepPortraitOutWindow: source['isKeepPortraitOutWindow'] === true,
    simpleDispFlagTime: typeof simpleDispFlagTime === 'number' ? simpleDispFlagTime : 0,
    simpleDispFlagUserId: typeof simpleDispFlagUserId === 'number' ? simpleDispFlagUserId : 0,
  };
}

function readScoped(value: unknown): ChatScopedSetting | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const scope = source['scope'] === 'perTab' ? 'perTab' : 'all';
  const all = Number(source['all']);
  return { scope, all: Number.isFinite(all) && all !== 0 ? 1 : 0 };
}

function readScopedSound(value: unknown): ChatScopedSoundSetting | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const tabs: Record<string, ChatSoundSetting> = {};
  const storedTabs = source['tabs'];
  if (storedTabs && typeof storedTabs === 'object') {
    for (const [name, raw] of Object.entries(storedTabs as Record<string, unknown>)) {
      const sound = readSound(raw);
      if (sound) tabs[name] = sound;
    }
  }
  return {
    scope: source['scope'] === 'perTab' ? 'perTab' : 'all',
    all: readSound(source['all']) ?? DEFAULT_CHAT_SOUND,
    tabs,
  };
}

function readSound(value: unknown): ChatSoundSetting | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  return {
    enabled: source['enabled'] === true,
    volume: clampChatSoundVolume(source['volume']),
    type: isChatSoundType(source['type']) ? source['type'] : DEFAULT_CHAT_SOUND_TYPE,
  };
}

function readTabs(value: unknown): Record<string, ChatTabPreferences> | null {
  if (!value || typeof value !== 'object') return null;
  const tabs: Record<string, ChatTabPreferences> = {};
  for (const [identifier, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const source = raw as Record<string, unknown>;
    const portraitDisplayFlag = source['portraitDisplayFlag'];
    const chatSimpleDispFlag = source['chatSimpleDispFlag'];
    if (typeof portraitDisplayFlag !== 'number' || typeof chatSimpleDispFlag !== 'number') continue;
    tabs[identifier] = { portraitDisplayFlag, chatSimpleDispFlag };
  }
  return Object.keys(tabs).length > 0 ? tabs : null;
}
