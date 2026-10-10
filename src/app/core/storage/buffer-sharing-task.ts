import { Logger } from '@axe/core/logging/logger';
import { NetworkMessage, networkMessage$, networkSend } from '@axe/core/network/network-messaging';
import * as MessagePack from '@axe/core/util/message-pack';
import { ResettableTimeout } from '@axe/core/util/resettable-timeout';
import { clearZeroTimeout, setZeroTimeout } from '@axe/core/util/zero-timeout';

interface ChunkData {
  index: number;
  length: number;
  chunk: Uint8Array;
}

export class BufferSharingTask<T> {
  readonly identifier: string;
  readonly sendTo: string | undefined;

  private data: T | null = null;
  private uint8Array: Uint8Array | null = null;
  private chunks: Uint8Array[] = [];
  private chunkSize: number = 64 * 1024;
  private chunkReceiveCount: number = 0;
  private sendChunkTimer: number | null = null;

  private sentChunkIndex = 0;
  private bufferingChunkRange: number = 4;
  private completedChunkIndex = 0;

  private startTime = 0;
  private isCanceled = false;

  private onstart: (() => void) | null = null;
  onprogress: ((task: BufferSharingTask<T>, loded: number, total: number) => void) | null = null;
  onfinish: ((task: BufferSharingTask<T>, data: T) => void) | null = null;
  ontimeout: ((task: BufferSharingTask<T>) => void) | null = null;
  oncancel: ((task: BufferSharingTask<T>) => void) | null = null;

  private timeoutTimer: ResettableTimeout | null = null;
  private cleanups: (() => void)[] = [];

  private constructor(identifier: string, sendTo?: string, data?: T) {
    this.identifier = identifier;
    this.sendTo = sendTo;
    if (data !== undefined) this.data = data;
  }

  /**
   * A task that sends data to one peer in chunks once started; the peer needs a receive
   * task under the same identifier.
   */
  static createSendTask<T>(identifier: string, sendTo: string, data?: T): BufferSharingTask<T> {
    const task = new BufferSharingTask(identifier, sendTo, data);
    task.onstart = () => task.initializeSend();
    return task;
  }

  /** A task that collects the chunks sent under this identifier and decodes them once all have arrived. */
  static createReceiveTask<T>(identifier: string): BufferSharingTask<T> {
    const task = new BufferSharingTask<T>(identifier);
    task.onstart = () => task.initializeReceive();
    return task;
  }

  /**
   * Begins sending or listening; a send task can take its data here instead of at creation.
   *
   * A task runs only once, and starting it again just logs a warning.
   */
  start(data?: T) {
    if (!this.onstart) {
      Logger.warn('[BufferTask] タスクは再利用できません');
      return;
    }
    if (data !== undefined) this.data = data;
    this.onstart();
    this.onstart = null;
  }

  private progress(loded: number, total: number) {
    if (this.onprogress) this.onprogress(this, loded, total);
  }

  private finish() {
    if (this.isCanceled) return;
    this.isCanceled = true;
    if (this.onfinish) this.onfinish(this, this.data as T);
    this.dispose();
  }

  private timeout() {
    if (this.isCanceled) return;
    this.isCanceled = true;
    if (this.ontimeout) this.ontimeout(this);
    if (this.onfinish) this.onfinish(this, this.data as T);
    this.dispose();
  }

  /**
   * Stops the task, calling `oncancel` and then `onfinish` with whatever data it holds.
   *
   * A send task also tells the receiving peer to give up. Does nothing once the task has
   * finished, timed out or been cancelled.
   */
  cancel() {
    if (this.isCanceled) return;
    if (this.sendTo != null) networkSend(`CANCEL_TASK_${this.identifier}`, null, this.sendTo);
    this._cancel();
  }

  private _cancel() {
    if (this.isCanceled) return;
    this.isCanceled = true;
    if (this.oncancel) this.oncancel(this);
    if (this.onfinish) this.onfinish(this, this.data as T);
    this.dispose();
  }

  private dispose() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    if (this.sendChunkTimer) clearZeroTimeout(this.sendChunkTimer);
    if (this.timeoutTimer) this.timeoutTimer.clear();
    this.sendChunkTimer = null;
    this.timeoutTimer = null;
    this.onprogress = this.onfinish = this.ontimeout = this.oncancel = null;
  }

  private initializeSend() {
    this.uint8Array = MessagePack.encode(this.data as T);
    const total = Math.ceil(this.uint8Array.byteLength / this.chunkSize);
    this.chunks = new Array(total);
    this.cleanups.push(
      networkMessage$.subscribe((msg) => {
        if (msg.eventName === `FILE_MORE_CHUNK_${this.identifier}`) {
          const m = msg as NetworkMessage<number>;
          if (this.sendTo !== m.sendFrom) return;
          this.completedChunkIndex = m.data;
          if (this.sendChunkTimer == null && this.sentChunkIndex + 1 < this.chunks.length) {
            this.sendChunk(this.sentChunkIndex + 1);
          }
          this.resetTimeout();
        } else if (msg.eventName === 'DISCONNECT_PEER') {
          const m = msg as NetworkMessage<{ peerId: string }>;
          if (m.data.peerId !== this.sendTo) return;
          Logger.warn('[BufferTask] 送信キャンセル（Peer切断）', m.data.peerId);
          this._cancel();
        } else if (msg.eventName === `CANCEL_TASK_${this.identifier}`) {
          Logger.warn('[BufferTask] 送信キャンセル', msg.sendFrom);
          this._cancel();
        }
      })
    );

    this.sentChunkIndex = this.completedChunkIndex = 0;
    this.startTime = performance.now();
    setZeroTimeout(() => this.sendChunk(0));
  }

  private sendChunk(index: number) {
    const uint8Array = this.uint8Array;
    if (!uint8Array) return;

    const chunk = uint8Array.slice(index * this.chunkSize, (index + 1) * this.chunkSize);
    const data = { index, length: this.chunks.length, chunk };
    networkSend(`FILE_SEND_CHUNK_${this.identifier}`, data, this.sendTo);
    this.sentChunkIndex = index;
    this.sendChunkTimer = null;
    if (this.chunks.length <= index + 1) {
      this.outputTransferRate(uint8Array.byteLength);
      setZeroTimeout(() => this.finish());
    } else if (this.completedChunkIndex + this.bufferingChunkRange <= index) {
      this.resetTimeout();
    } else {
      this.sendChunkTimer = setZeroTimeout(() => {
        this.sendChunk(this.sentChunkIndex + 1);
      });
    }
  }

  private initializeReceive() {
    this.resetTimeout();
    this.startTime = performance.now();
    this.chunkReceiveCount = 0;

    this.cleanups.push(
      networkMessage$.subscribe((msg) => {
        if (msg.eventName === `FILE_SEND_CHUNK_${this.identifier}`) {
          const m = msg as NetworkMessage<ChunkData>;
          if (this.chunks.length < 1) this.chunks = new Array(m.data.length);
          if (this.chunks[m.data.index] != null) return;
          this.chunkReceiveCount++;
          this.chunks[m.data.index] = m.data.chunk;
          this.progress(m.data.index, m.data.length);
          if (this.chunks.length <= this.chunkReceiveCount) {
            this.finishReceive();
          } else {
            this.resetTimeout();
            networkSend(`FILE_MORE_CHUNK_${this.identifier}`, m.data.index, m.sendFrom);
          }
        } else if (msg.eventName === 'DISCONNECT_PEER') {
          const m = msg as NetworkMessage<{ peerId: string }>;
          if (m.data.peerId !== this.sendTo) return;
          Logger.warn('[BufferTask] 受信キャンセル（Peer切断）', m.data.peerId);
          this._cancel();
        } else if (msg.eventName === `CANCEL_TASK_${this.identifier}`) {
          Logger.warn('[BufferTask] 受信キャンセル', msg.sendFrom);
          this._cancel();
        }
      })
    );
  }

  private finishReceive() {
    let sumLength = 0;
    for (const chunk of this.chunks) {
      sumLength += chunk.byteLength;
    }

    this.outputTransferRate(sumLength);
    const uint8Array = new Uint8Array(sumLength);
    let pos = 0;

    for (const chunk of this.chunks) {
      uint8Array.set(chunk, pos);
      pos += chunk.byteLength;
    }

    this.data = MessagePack.decode(uint8Array) as T;
    this.finish();
  }

  private resetTimeout() {
    if (this.timeoutTimer == null) this.timeoutTimer = new ResettableTimeout(() => this.timeout(), 10 * 1000);
    this.timeoutTimer.reset();
  }

  private outputTransferRate(byteLength: number) {
    const time = performance.now() - this.startTime;
    const rate = byteLength / 1024 / 1024 / (time / 1000);
    Logger.debug(
      `[BufferTask] ${(byteLength / 1024).toFixed(2)}KB ${(time / 1000).toFixed(2)}秒 転送速度: ${rate.toFixed(2)}MB/s`
    );
  }
}
