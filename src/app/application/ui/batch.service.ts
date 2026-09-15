import { Injectable } from '@angular/core';
import { setZeroTimeout } from '@axe/core/util/zero-timeout';

type BatchTask = () => void;

@Injectable({
  providedIn: 'root',
})
export class BatchService {
  private batchTask: Map<unknown, BatchTask> = new Map();
  private batchTaskTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Queues work to run on the next batch tick rather than straight away.
   *
   * Work queued under a key replaces whatever was waiting under the same key, so a directive that
   * asks again before the tick runs once. The default key is a fresh object and never collides. The
   * first batch runs on a zero timeout, and later ones every 66ms for as long as anything is
   * waiting.
   */
  add(task: BatchTask, key: unknown = {}) {
    this.batchTask.set(key, task);
    this.startTimer();
  }

  /** Drops the work waiting under a key before it runs. Nothing happens when none is waiting. */
  remove(key: unknown = {}) {
    this.batchTask.delete(key);
  }

  private startTimer() {
    if (this.batchTaskTimer !== null) return;
    setZeroTimeout(() => this.execBatch());
    this.batchTaskTimer = setInterval(() => {
      if (this.batchTask.size > 0) {
        this.execBatch();
      } else {
        clearInterval(this.batchTaskTimer!);
        this.batchTaskTimer = null;
      }
    }, 66);
  }

  private execBatch() {
    this.batchTask.forEach((task) => task());
    this.batchTask.clear();
  }
}
