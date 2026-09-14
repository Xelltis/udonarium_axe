import { NetworkMessage, networkMessage$, networkSend } from '@axe/core/network/network-messaging';
import { ResettableTimeout } from '@axe/core/util/resettable-timeout';

type PeerId = string;
type ObjectIdentifier = string;

export interface SynchronizeRequest {
  identifier: string;
  version: number;
  holderIds: string[];
  ttl: number;
}

export class SynchronizeTask {
  private static cleanup: (() => void) | null = null;
  private static tasksMap: Map<ObjectIdentifier, SynchronizeTask[]> = new Map();

  onsynchronize: ((task: SynchronizeTask, identifier: string) => void) | null = null;
  onfinish: ((task: SynchronizeTask) => void) | null = null;
  ontimeout: ((task: SynchronizeTask, remainedRequests: SynchronizeRequest[]) => void) | null = null;

  private requestMap: Map<ObjectIdentifier, SynchronizeRequest> = new Map();
  private timeoutTimer: ResettableTimeout | null = null;

  private constructor(readonly peerId: PeerId) {}

  /**
   * Starts asking for the requested objects: from the peer when it holds them, else from the room.
   *
   * Each request loses one ttl. The task finishes once every object has arrived or been deleted, and
   * times out after 30 seconds without progress or when the peer disconnects. With no requests it
   * finishes on the next tick, so set onfinish and ontimeout straight after creating it.
   */
  static create(peerId: PeerId, requests: SynchronizeRequest[]): SynchronizeTask {
    if (SynchronizeTask.tasksMap.size < 1) {
      const off = networkMessage$.subscribe((msg) => {
        switch (msg.eventName) {
          case 'DISCONNECT_PEER':
            SynchronizeTask.onDisconnect((msg as NetworkMessage<{ peerId: string }>).data.peerId);
            break;
          case 'UPDATE_GAME_OBJECT':
            if (!msg.isSendFromSelf)
              SynchronizeTask.onUpdate((msg as NetworkMessage<{ identifier: string }>).data.identifier);
            break;
          case 'DELETE_GAME_OBJECT':
            if (!msg.isSendFromSelf)
              SynchronizeTask.onUpdate((msg as NetworkMessage<{ identifier: string }>).data.identifier);
            break;
        }
      });
      SynchronizeTask.cleanup = off;
    }
    const task = new SynchronizeTask(peerId);
    task.initialize(requests);
    return task;
  }

  private cancel() {
    this.timeoutTimer?.clear();
    this.timeoutTimer = null;
    this.onsynchronize = this.onfinish = this.ontimeout = null;

    for (const request of this.requestMap.values()) {
      this.deleteTasksMap(request.identifier);
    }

    this.requestMap.clear();
  }

  private initialize(requests: SynchronizeRequest[]) {
    for (const request of requests) {
      request.ttl--;
      this.requestMap.set(request.identifier, request);
      const tasks: SynchronizeTask[] = SynchronizeTask.tasksMap.get(request.identifier) ?? [];
      tasks.push(this);
      SynchronizeTask.tasksMap.set(request.identifier, tasks);
      const sendTo = this.peerId !== null && request.holderIds.includes(this.peerId) ? this.peerId : undefined;
      networkSend('REQUEST_GAME_OBJECT', request.identifier, sendTo);
    }

    if (this.requestMap.size < 1) {
      setTimeout(() => this.finish());
      return;
    }

    this.resetTimeout();
  }

  private finish() {
    this.onfinish?.(this);
    this.cancel();
  }

  private timeout() {
    if (this.ontimeout) {
      const remained: SynchronizeRequest[] = [];
      for (const request of this.requestMap.values()) {
        if (0 <= request.ttl) remained.push(request);
      }
      this.ontimeout(this, remained);
    }
    this.finish();
  }

  private static onDisconnect(peerId: PeerId) {
    for (const tasks of SynchronizeTask.tasksMap.values()) {
      for (const task of [...tasks]) {
        if (task.peerId === peerId) task.timeout();
      }
    }
    if (SynchronizeTask.tasksMap.size < 1) {
      SynchronizeTask.cleanup?.();
      SynchronizeTask.cleanup = null;
    }
  }

  private static onUpdate(identifier: ObjectIdentifier) {
    if (!SynchronizeTask.tasksMap.has(identifier)) return;
    const tasks = SynchronizeTask.tasksMap.get(identifier)!;
    for (const task of [...tasks]) {
      task.onUpdate(identifier);
    }
    if (SynchronizeTask.tasksMap.size < 1) {
      SynchronizeTask.cleanup?.();
      SynchronizeTask.cleanup = null;
    }
  }

  private onUpdate(identifier: ObjectIdentifier) {
    this.requestMap.delete(identifier);
    this.onsynchronize?.(this, identifier);
    if (this.requestMap.size < 1) {
      this.finish();
    } else {
      this.resetTimeout();
    }
  }

  private deleteTasksMap(identifier: ObjectIdentifier) {
    const tasks = SynchronizeTask.tasksMap.get(identifier)!;
    const index = tasks.indexOf(this);
    if (index >= 0) tasks.splice(index, 1);
    if (tasks.length < 1) SynchronizeTask.tasksMap.delete(identifier);
  }

  private resetTimeout() {
    if (this.timeoutTimer === null) this.timeoutTimer = new ResettableTimeout(() => this.timeout(), 30 * 1000);
    this.timeoutTimer.reset();
  }
}
