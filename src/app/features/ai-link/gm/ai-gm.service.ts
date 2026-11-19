import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AgentEventLog } from '@axe/application/agent/agent-event-log.service';
import { AgentViews } from '@axe/application/agent/agent-views.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GM_DEFAULT_SETTINGS } from '@axe/core/agent/agent-gm';
import {
  GM_INSTRUCTIONS_MAX,
  GM_MODEL_NAME_MAX,
  GM_NOTES_MAX,
  type GmBridgeMessage,
  type GmEffort,
  type GmEventEntry,
  type GmModelOffer,
  type GmSettings,
  type GmStatus,
} from '@axe/core/agent/agent-protocol';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { AiLinkService } from '@axe/features/ai-link/ai-link.service';
import { type AiGmMode, type AiGmWakeContext, aiGmWakeOf } from '@axe/features/ai-link/gm/ai-gm-wake';

/** What this browser keeps of the game master: how it is run, and what the person wrote for it. */
export interface AiGmPreferences {
  readonly settings: GmSettings;
  readonly mode: AiGmMode;
  /** The name it is called by in a line. */
  readonly callName: string;
  /** The chat tabs it listens to, by identifier; none for every tab. */
  readonly tabs: readonly string[];
  /** What the person at the seat tells it of the world, the tone, the rules and the secrets. */
  readonly instructions: string;
  /** Its notebook, as it last wrote it or the person rewrote it. */
  readonly notes: string;
}

/** The name the game master is called by unless the person chose another. */
export const AI_GM_DEFAULT_CALL_NAME = 'GM';

/** A word the game master wrote aside for the person at the seat, and when. */
export interface AiGmAside {
  readonly text: string;
  readonly at: number;
}

/** How many words aside are kept to read. */
const ASIDES_KEPT = 50;
/** The longest a wait for what happens lasts before it is begun again. */
const WAIT_MS = 30_000;
/** The most events handed on in one message. */
const EVENTS_AT_ONCE = 500;
const EFFORTS: readonly GmEffort[] = ['low', 'medium', 'high'];

function textOf(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/**
 * What a browser kept, read whatever it holds: anything missing or out of bounds is the default, an
 * empty budget included (it is never read as nothing to spend).
 */
export function readAiGmPreferences(raw: string | null): AiGmPreferences {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
  } catch {
    stored = {};
  }
  const settings = (stored['settings'] ?? {}) as Record<string, unknown>;
  const budget = typeof settings['budgetUsd'] === 'number' ? settings['budgetUsd'] : NaN;
  const model = textOf(settings['model'], GM_MODEL_NAME_MAX);
  const effort = EFFORTS.find((each) => each === settings['effort']);
  return {
    settings: {
      model: model || GM_DEFAULT_SETTINGS.model,
      effort: effort ?? GM_DEFAULT_SETTINGS.effort,
      budgetUsd: Number.isFinite(budget) && budget > 0 && budget <= 1000 ? budget : GM_DEFAULT_SETTINGS.budgetUsd,
    },
    mode: stored['mode'] === 'called' ? 'called' : 'respond',
    callName: typeof stored['callName'] === 'string' ? stored['callName'].slice(0, 40) : AI_GM_DEFAULT_CALL_NAME,
    tabs: Array.isArray(stored['tabs']) ? stored['tabs'].filter((tab): tab is string => typeof tab === 'string') : [],
    instructions: textOf(stored['instructions'], GM_INSTRUCTIONS_MAX),
    notes: textOf(stored['notes'], GM_NOTES_MAX),
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
}

/**
 * The game master a bridge runs for this seat, or hands the turns of to an AI app, as the tab sees it: how it is set up and what the
 * person wrote for it (kept in this browser only, never synchronised or saved with the room), how
 * it stands as the bridge tells it, and what it wrote aside. While it runs, everything the seat sees
 * happen is handed on to the bridge as it happens, each event marked where it calls for a turn: the
 * bridge does the waiting, as a tab out of sight is given few timers. The room is told when it starts
 * and stops.
 */
@Injectable({ providedIn: 'root' })
export class AiGmService {
  private readonly link = inject(AiLinkService);
  private readonly events = inject(AgentEventLog);
  private readonly views = inject(AgentViews);
  private readonly chat = inject(ChatMessageService);
  private readonly permission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private relay: AbortController | null = null;
  /**
   * How far what happens has been handed on: kept while the link is lost, so that what happened
   * meanwhile is handed on once it is back, and let go of once the game master is stopped.
   */
  private cursor: string | null = null;
  /**
   * How many askings to start the bridge had answered when it was last asked here, while the answer
   * to that asking is awaited; null otherwise. What the bridge tells of itself meanwhile, in answer to
   * anything else, still counts as many.
   */
  private askedAfter: number | null = null;

  readonly preferences = signal<AiGmPreferences>(readAiGmPreferences(readLocal(STORAGE_KEYS.aiGm)));
  /** How the game master stands, as the bridge last told it; null until a bridge running it is connected. */
  readonly status = signal<GmStatus | null>(null);
  /** What it wrote aside, newest first. */
  readonly asides = signal<readonly AiGmAside[]>([]);

  /** Whether a bridge is connected: either kind takes the game master, running it or handing its turns on. */
  readonly linked = computed(() => this.link.state().kind === 'connected');
  /**
   * Whether the bridge connected hands the game master's turns to an AI app connected over MCP, whose
   * model and spending are that app's and not chosen here.
   */
  readonly bridgeHandsTurns = computed(() => {
    const state = this.link.state();
    return state.kind === 'connected' && state.mode === 'mcp';
  });
  /** The models the bridge connected runs. */
  readonly models = computed<readonly GmModelOffer[]>(() => {
    const state = this.link.state();
    return state.kind === 'connected' ? state.models : [];
  });
  /**
   * Whether the model chosen here is none of those the bridge connected runs, as one kept from another
   * version of the bridge may be. It is not started with: the bridge would refuse, and a game master
   * running keeps to the model it runs.
   */
  readonly modelNotRun = computed(() => {
    const models = this.models();
    return models.length > 0 && !models.some((model) => model.id === this.preferences().settings.model);
  });
  /** Whether the game master runs now. */
  readonly running = computed(() => this.linked() && (this.status()?.run ?? 'off') !== 'off');
  /**
   * Whether it runs with no AI there to take its turns, as a bridge handing them on tells: the AI app
   * was closed, or its AI has stopped waiting.
   */
  readonly unattended = computed(() => this.running() && this.status()?.attended === false);

  /** The pieces it runs: those marked as NPCs, and those of its own seat. */
  readonly pieces = computed(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => {
        this.objectChange.versionOf(piece.identifier)();
        return this.runsPiece(piece);
      })
      .map((piece) => piece.name);
  });

  constructor() {
    // What the bridge told before anyone here listened: the notebook it holds is newer than the one kept.
    const latest = this.link.latestGm();
    if (latest.status) this.hear({ type: 'gm.status', status: latest.status });
    if (latest.notes !== null) this.hear({ type: 'gm.notes', notes: latest.notes });
    const heard = this.link.gmHeard.subscribe((message) => this.hear(message));
    const gone = this.link.keepsGm();
    effect(() => {
      const running = this.running();
      // The tabs it is kept to are told to where its lines are made before anything is handed on, so
      // that no line said meanwhile slips by. Tabs chosen in another room, or since taken away, are
      // none of this room's: with none of them left, every tab is read.
      const chosen = running ? this.preferences().tabs : [];
      this.objectChange.collectionOf('chat-tab')();
      const here = chosen.filter((tab) => ChatTabList.instance.chatTabs.some((each) => each.identifier === tab));
      untracked(() => {
        this.views.tabsRead.set(here.length > 0 ? new Set(here) : null);
        if (running) this.startRelay();
        else this.stopRelay();
      });
    });
    effect(() => {
      if (this.linked()) return;
      untracked(() => {
        this.status.set(null);
        this.askedAfter = null;
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.views.tabsRead.set(null);
      heard.unsubscribe();
      gone();
      this.stopRelay();
    });
  }

  /**
   * Whether the game master may be started here: on the game master's seat, with a bridge connected,
   * and where the bridge runs the model itself, one it runs chosen.
   */
  mayStart(): boolean {
    return this.linked() && this.permission.isGameMaster() && !this.modelNotRun();
  }

  /** Starts it, letting the AI change the room, carrying on from the conversation the bridge kept unless told afresh. */
  start(fresh: boolean): boolean {
    if (!this.mayStart()) return false;
    this.link.lendWrite();
    const { settings, instructions, notes } = this.preferences();
    const told = this.link.tellGm({ type: 'gm.start', settings, instructions, notes, fresh });
    if (told) this.askedAfter = this.status()?.starts ?? 0;
    else this.link.takeBack();
    return told;
  }

  stop(): void {
    this.link.tellGm({ type: 'gm.stop' });
  }

  /** Asks it to take its turn now, with a word from the person if one is given. */
  nudge(direction: string): boolean {
    return this.running() && this.link.tellGm({ type: 'gm.nudge', direction });
  }

  /**
   * Changes what is kept of it, telling the bridge what the game master is told of, stopped or not:
   * the bridge keeps the notebook too, and would give back its own over one rewritten here.
   */
  update(changes: Partial<AiGmPreferences>): void {
    const next = { ...this.preferences(), ...changes };
    this.preferences.set(next);
    this.store();
    if (!this.linked()) return;
    if ('settings' in changes || 'instructions' in changes || 'notes' in changes) {
      this.link.tellGm({
        type: 'gm.update',
        settings: next.settings,
        instructions: next.instructions,
        notes: next.notes,
      });
    }
  }

  /**
   * Takes in what the bridge tells. Told that the game master is off, in answer to an asking to start
   * or with none awaited, it gives back what the AI was let do before: stopped, refused, or found
   * stopped on coming back to the page.
   */
  private hear(message: GmBridgeMessage): void {
    switch (message.type) {
      case 'gm.status': {
        const was = this.status();
        this.status.set(message.status);
        if (message.status.run === 'off') this.cursor = null;
        if (was && was.run === 'off' && message.status.run !== 'off') this.tellRoom('feature.aiGm.notice.started');
        if (was && was.run !== 'off' && message.status.run === 'off') this.tellRoom('feature.aiGm.notice.stopped');
        const answered = this.askedAfter === null || message.status.starts > this.askedAfter;
        if (answered) this.askedAfter = null;
        if (answered && message.status.run === 'off') this.link.takeBack();
        return;
      }
      case 'gm.notes':
        this.preferences.update((preferences) => ({ ...preferences, notes: message.notes }));
        this.store();
        return;
      case 'gm.said':
        this.asides.update((asides) => [{ text: message.text, at: message.at }, ...asides].slice(0, ASIDES_KEPT));
        return;
    }
  }

  private runsPiece(piece: GameCharacter): boolean {
    const me = PeerCursor.myCursor?.userId ?? '';
    return piece.isNpc || (me !== '' && piece.owner === me);
  }

  private wakeContext(): AiGmWakeContext {
    const { mode, callName } = this.preferences();
    const me = PeerCursor.myCursor?.userId ?? '';
    const line = (id: string) => {
      const message = this.objectStore.get<ChatMessage>(id);
      return message instanceof ChatMessage ? message : null;
    };
    return {
      mode,
      callName,
      saidHere: (id) => me !== '' && line(id)?.from === me,
      whisperedHere: (id) => me !== '' && (line(id)?.sendTo.includes(me) ?? false),
      runsPiece: (id) => {
        const piece = this.objectStore.get<GameCharacter>(id);
        return piece instanceof GameCharacter && this.runsPiece(piece);
      },
    };
  }

  private startRelay(): void {
    if (this.relay) return;
    const relay = new AbortController();
    this.relay = relay;
    this.cursor ??= this.events.cursorNow();
    void this.pump(relay.signal);
  }

  private stopRelay(): void {
    this.relay?.abort();
    this.relay = null;
  }

  /**
   * Hands on everything that happens from the cursor, as it happens, until the relay is stopped. The
   * cursor moves on only past what reached the bridge.
   */
  private async pump(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const began = Date.now();
      const batch = await this.events.waitFor(this.cursor ?? undefined, WAIT_MS, signal);
      if (signal.aborted) return;
      if (batch.events.length > 0) {
        const context = this.wakeContext();
        const entries: GmEventEntry[] = batch.events.map((event) => {
          const wake = aiGmWakeOf(event, context);
          const plain = event as unknown as Readonly<Record<string, unknown>>;
          return wake ? { event: plain, wake } : { event: plain };
        });
        for (let at = 0; at < entries.length; at += EVENTS_AT_ONCE) {
          // Not handed on, as the link is going: taken up again from here once it is back.
          if (!this.link.tellGm({ type: 'gm.events', events: entries.slice(at, at + EVENTS_AT_ONCE) })) return;
        }
      } else if (Date.now() - began < 1000) {
        // A log that is not keeping anything answers at once: wait before asking again.
        await sleep(1000, signal);
      }
      if (!signal.aborted) this.cursor = batch.cursor;
    }
  }

  private tellRoom(key: string): void {
    this.chat.sendSystemNotice('room', encodeI18nMessage(key, { name: PeerCursor.myCursor?.name ?? '' }));
  }

  private store(): void {
    writeLocal(STORAGE_KEYS.aiGm, JSON.stringify(this.preferences()));
  }
}
