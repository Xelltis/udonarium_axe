import { Logger } from '@axe/core/logging/logger';

export class PromiseQueue {
  private queue: Promise<unknown> = Promise.resolve();

  private _length: number = 0;
  /** How many added tasks have not finished yet, counting the one running. */
  get length(): number {
    return this._length;
  }

  constructor(readonly name: string = 'Queue') {}

  /**
   * Runs the task once every task added before it has settled, and settles with its result.
   *
   * A task that fails rejects its own promise and is logged, but does not stop the tasks after it.
   */
  add<T>(task: () => T | PromiseLike<T>): Promise<T> {
    this._length++;
    this.queue = this.queue.then(task);

    const ret = this.queue as Promise<T>;
    this.queue = this.queue.catch((reason) => {
      Logger.error(`[${this.name}] タスク実行エラー`, reason);
    });
    this.queue = this.queue.then(() => {
      this._length--;
    });
    return ret;
  }
}
