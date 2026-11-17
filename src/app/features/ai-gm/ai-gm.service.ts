import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AgentEventLog } from '@axe/application/agent/agent-event-log.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GM_DEFAULT_SETTINGS } from '@axe/core/agent/agent-gm';
import {
  GM_INSTRUCTIONS_MAX,
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
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { type AiGmMode, type AiGmWakeContext, aiGmWakeOf } from '@axe/features/ai-gm/ai-gm-wake';
import { AiLinkService } from '@axe/features/ai-link/ai-link.service';

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
  const model = textOf(settings['model'], 100);
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
 * The game master a bridge runs for this seat, as the tab sees it: how it is set up and what the
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
  private readonly chat = inject(ChatMessageService);
  private readonly permission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private relay: AbortController | null = null;

  readonly preferences = signal<AiGmPreferences>(readAiGmPreferences(readLocal(STORAGE_KEYS.aiGm)));
  /** How the game master stands, as the bridge last told it; null until a bridge running it is connected. */
  readonly status = signal<GmStatus | null>(null);
  /** What it wrote aside, newest first. */
  readonly asides = signal<readonly AiGmAside[]>([]);

  /** Whether the bridge connected runs the game master. */
  readonly bridgeRunsGm = computed(() => {
    const state = this.link.state();
    return state.kind === 'connected' && state.mode === 'gm';
  });
  /** The models the bridge connected runs. */
  readonly models = computed<readonly GmModelOffer[]>(() => {
    const state = this.link.state();
    return state.kind === 'connected' ? state.models : [];
  });
  /** Whether the game master runs now. */
  readonly running = computed(() => this.bridgeRunsGm() && (this.status()?.run ?? 'off') !== 'off');

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
    if (latest.status) this.status.set(latest.status);
    if (latest.notes !== null) this.hear({ type: 'gm.notes', notes: latest.notes });
    const heard = this.link.gmHeard.subscribe((message) => this.hear(message));
    effect(() => {
      const running = this.running();
      untracked(() => (running ? this.startRelay() : this.stopRelay()));
    });
    effect(() => {
      if (!this.bridgeRunsGm()) untracked(() => this.status.set(null));
    });
    inject(DestroyRef).onDestroy(() => {
      heard.unsubscribe();
      this.stopRelay();
    });
  }

  /** Whether the game master may be started here: on the game master's seat, with a bridge that runs it. */
  mayStart(): boolean {
    return this.bridgeRunsGm() && this.permission.isGameMaster();
  }

  /** Starts it, letting the AI change the room, carrying on from the conversation the bridge kept unless told afresh. */
  start(fresh: boolean): boolean {
    if (!this.mayStart()) return false;
    this.link.setScope('write');
    const { settings, instructions, notes } = this.preferences();
    return this.link.tellGm({ type: 'gm.start', settings, instructions, notes, fresh });
  }

  stop(): void {
    this.link.tellGm({ type: 'gm.stop' });
  }

  /** Asks it to take its turn now, with a word from the person if one is given. */
  nudge(direction: string): boolean {
    return this.running() && this.link.tellGm({ type: 'gm.nudge', direction });
  }

  /** Changes what is kept of it, telling a running game master what it is told of. */
  update(changes: Partial<AiGmPreferences>): void {
    const next = { ...this.preferences(), ...changes };
    this.preferences.set(next);
    this.store();
    if (!this.running()) return;
    if ('settings' in changes || 'instructions' in changes || 'notes' in changes) {
      this.link.tellGm({
        type: 'gm.update',
        settings: next.settings,
        instructions: next.instructions,
        notes: next.notes,
      });
    }
  }

  private hear(message: GmBridgeMessage): void {
    switch (message.type) {
      case 'gm.status': {
        const was = this.status();
        this.status.set(message.status);
        if (was && was.run === 'off' && message.status.run !== 'off') this.tellRoom('feature.aiGm.notice.started');
        if (was && was.run !== 'off' && message.status.run === 'off') this.tellRoom('feature.aiGm.notice.stopped');
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
    const { mode, callName, tabs } = this.preferences();
    return {
      mode,
      callName,
      tabs,
      seatName: PeerCursor.myCursor?.name ?? '',
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
    void this.pump(relay.signal, this.events.cursorNow());
  }

  private stopRelay(): void {
    this.relay?.abort();
    this.relay = null;
  }

  /** Hands on everything that happens from the cursor, as it happens, until the relay is stopped. */
  private async pump(signal: AbortSignal, from: string): Promise<void> {
    let cursor = from;
    while (!signal.aborted) {
      const began = Date.now();
      const batch = await this.events.waitFor(cursor, WAIT_MS, signal);
      if (signal.aborted) return;
      if (batch.events.length > 0) {
        const context = this.wakeContext();
        const entries: GmEventEntry[] = batch.events.map((event) => {
          const wake = aiGmWakeOf(event, context);
          const plain = event as unknown as Readonly<Record<string, unknown>>;
          return wake ? { event: plain, wake } : { event: plain };
        });
        for (let at = 0; at < entries.length; at += EVENTS_AT_ONCE) {
          this.link.tellGm({ type: 'gm.events', events: entries.slice(at, at + EVENTS_AT_ONCE) });
        }
      } else if (Date.now() - began < 1000) {
        // A log that is not keeping anything answers at once: wait before asking again.
        await sleep(1000, signal);
      }
      cursor = batch.cursor;
    }
  }

  private tellRoom(key: string): void {
    this.chat.sendSystemNotice('room', encodeI18nMessage(key, { name: PeerCursor.myCursor?.name ?? '' }));
  }

  private store(): void {
    writeLocal(STORAGE_KEYS.aiGm, JSON.stringify(this.preferences()));
  }
}
