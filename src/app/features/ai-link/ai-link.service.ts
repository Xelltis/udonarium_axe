import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AgentToolRunner } from '@axe/application/agent/agent-tool-runner.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AgentBridgeClient, type AgentLinkState } from '@axe/core/agent/agent-bridge-client';
import {
  AGENT_BRIDGE_PORT,
  type AgentScope,
  type AgentSeat,
  type GmBridgeMessage,
  type GmStatus,
  type GmTabMessage,
} from '@axe/core/agent/agent-protocol';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { AgentToolsSetup } from '@axe/features/agent-tools/agent-tools-setup.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { version as APP_VERSION } from '@pkg';
import { Subject } from 'rxjs';

/** What this browser keeps of the link: the bridge's port, and what the AI was last let do. */
interface StoredLink {
  readonly port: number;
  readonly scope: AgentScope;
  /** What the AI was let do before a game master was let change the room, or null where none was. */
  readonly lentFrom: AgentScope | null;
}

function readStoredLink(): StoredLink {
  try {
    const stored = JSON.parse(readLocal(STORAGE_KEYS.aiLink) ?? '{}') as Partial<StoredLink>;
    const port = Number(stored.port);
    return {
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : AGENT_BRIDGE_PORT,
      scope: stored.scope === 'write' ? 'write' : 'read',
      lentFrom: stored.lentFrom === 'write' || stored.lentFrom === 'read' ? stored.lentFrom : null,
    };
  } catch {
    return { port: AGENT_BRIDGE_PORT, scope: 'read', lentFrom: null };
  }
}

/** How long the link waits before looking for the bridge again, once it has none. */
const RETRY_MS = 3000;

/**
 * This seat's link to an AI: the bridge on this computer it connects to, what it lets the AI do, and
 * where the link stands. Once its person presses Connect, it keeps looking for the bridge until it is
 * pressed to stop, so that the AI may be started before or after and restarted at will. The link holds
 * while the panel is closed, and is let go of with the page: a page opened afresh is connected only
 * when its person presses Connect again. Everyone in the room is told when a seat starts or ends a
 * link, or changes what it lets the AI do, so that nobody plays beside an AI without knowing.
 */
@Injectable({ providedIn: 'root' })
export class AiLinkService {
  private readonly runner = inject(AgentToolRunner);
  private readonly chat = inject(ChatMessageService);
  private readonly permission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tools = inject(AgentToolsSetup);
  private readonly panels = inject(RoomPanelService);
  private client: AgentBridgeClient | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;

  /** Where the link stands. */
  readonly state = signal<AgentLinkState>({ kind: 'idle' });
  /** The port the bridge waits on. */
  readonly port = signal(AGENT_BRIDGE_PORT);
  /** What the person at the seat lets the AI do; a seat that watches lets it read only, whatever this says. */
  readonly scope = signal<AgentScope>('read');
  /** What a bridge running the game master tells of itself. */
  readonly gmHeard = new Subject<GmBridgeMessage>();
  /**
   * What the AI was let do before a game master was let change the room, to give back once it stops:
   * kept with the link, so a page opened again while it runs still gives it back.
   */
  private lentFrom: AgentScope | null = null;
  /** How many AI GM panels are open, as they tell it: one is opened on reaching a game-master bridge if none is. */
  private gmPanels = 0;
  /** What the bridge connected last told of the game master, for whoever comes to listen later. */
  private gmLatest: { status: GmStatus | null; notes: string | null } = { status: null, notes: null };

  constructor() {
    const stored = readStoredLink();
    this.port.set(stored.port);
    this.scope.set(stored.scope);
    this.lentFrom = stored.lentFrom;
    effect(() => {
      const cursor = PeerCursor.myCursor;
      if (cursor) this.objectChange.versionOf(cursor.identifier)();
      this.permission.role();
      untracked(() => this.client?.tellSeat());
    });
    inject(DestroyRef).onDestroy(() => {
      this.stopRetrying();
      this.client?.close();
    });
  }

  /** The seat as the bridge is told it. */
  seat(): AgentSeat {
    const role = this.permission.role();
    return {
      name: PeerCursor.myCursor?.name ?? '',
      role,
      scope: canRoleEdit(role) ? this.scope() : 'read',
    };
  }

  /** Whether the person wants the link: it is connected, or looking for the bridge. */
  wanted(): boolean {
    return this.client !== null;
  }

  /** Connects to the bridge, letting go of any link before, and keeps looking for it until told to stop. */
  connect(): void {
    this.tools.ensure();
    this.stopRetrying();
    this.client?.close();
    this.gmLatest = { status: null, notes: null };
    const client = new AgentBridgeClient({
      port: this.port(),
      app: APP_VERSION,
      seat: () => this.seat(),
      run: (tool, args, signal) => this.runner.run(tool, args, this.seat().scope, signal),
      onState: (state) => this.become(client, state),
      onGm: (message) => {
        if (this.client !== client) return;
        if (message.type === 'gm.status') this.gmLatest = { ...this.gmLatest, status: message.status };
        if (message.type === 'gm.notes') this.gmLatest = { ...this.gmLatest, notes: message.notes };
        this.gmHeard.next(message);
      },
    });
    this.client = client;
    client.connect();
  }

  /** Lets go of the bridge, telling the room where the AI was connected. */
  disconnect(): void {
    const client = this.client;
    if (!client) return;
    const wasConnected = client.current.kind === 'connected';
    this.client = null;
    this.stopRetrying();
    client.close();
    this.tools.release();
    this.state.set({ kind: 'idle' });
    if (wasConnected) this.tellRoom('feature.aiLink.notice.ended');
  }

  /**
   * Changes what the AI is let do as the person at the seat chooses, telling the bridge, and the room
   * where the AI is connected. What the person chooses stands: nothing lent to a game master is given
   * back over it afterwards.
   */
  setScope(scope: AgentScope): void {
    this.changeScope(scope, null);
  }

  /** Lets the AI change the room for as long as a game master runs, remembering what it was let do before. */
  lendWrite(): void {
    this.changeScope('write', this.lentFrom ?? this.scope());
  }

  /** Gives back what the AI was let do before a game master was let change the room, if one was. */
  takeBack(): void {
    const before = this.lentFrom;
    if (before === null) return;
    this.changeScope(before, null);
  }

  /** Sets what the AI is let do and what it was let do before a lending, keeping both, and tells of a change. */
  private changeScope(scope: AgentScope, lentFrom: AgentScope | null): void {
    const changed = scope !== this.scope();
    this.scope.set(scope);
    this.lentFrom = lentFrom;
    this.store();
    if (!changed || this.state().kind !== 'connected') return;
    this.client?.tellSeat();
    this.tellRoom(scope === 'write' ? 'feature.aiLink.notice.nowWrite' : 'feature.aiLink.notice.nowRead');
  }

  /** Told by an AI GM panel as it opens (`true`) and closes (`false`). */
  noteGmPanel(open: boolean): void {
    this.gmPanels = Math.max(0, this.gmPanels + (open ? 1 : -1));
  }

  /** How the game master stood and its notebook, as the bridge connected last told them. */
  latestGm(): { readonly status: GmStatus | null; readonly notes: string | null } {
    return this.client?.current.kind === 'connected' ? this.gmLatest : { status: null, notes: null };
  }

  /** Tells a bridge running the game master something, returning whether it went. */
  tellGm(message: GmTabMessage): boolean {
    return this.client?.tellGm(message) ?? false;
  }

  /** Changes the port the bridge is looked for on, from the next connection. */
  setPort(port: number): void {
    if (!Number.isInteger(port) || port < 1 || port > 65535) return;
    this.port.set(port);
    this.store();
  }

  private become(client: AgentBridgeClient, state: AgentLinkState): void {
    if (this.client !== client) return;
    const was = this.state().kind;
    this.state.set(state);
    if (state.kind === 'connected' && was !== 'connected') {
      // What a game master was lent is not left to a bridge that runs none.
      if (state.mode !== 'gm') this.takeBack();
      this.tellRoom(
        this.seat().scope === 'write' ? 'feature.aiLink.notice.startedWrite' : 'feature.aiLink.notice.startedRead'
      );
      // A bridge running the game master is worked from the AI GM panel, which also hands it what happens.
      if (state.mode === 'gm' && this.gmPanels === 0) this.panels.open('aiGm');
    }
    if (state.kind === 'lost') {
      if (was === 'connected') this.tellRoom('feature.aiLink.notice.lost');
      this.stopRetrying();
      this.retry = setTimeout(() => {
        this.retry = null;
        if (this.client === client) client.connect();
      }, RETRY_MS);
    }
  }

  private stopRetrying(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
  }

  private tellRoom(key: string): void {
    this.chat.sendSystemNotice('room', encodeI18nMessage(key, { name: PeerCursor.myCursor?.name ?? '' }));
  }

  private store(): void {
    writeLocal(
      STORAGE_KEYS.aiLink,
      JSON.stringify({ port: this.port(), scope: this.scope(), lentFrom: this.lentFrom })
    );
  }
}
