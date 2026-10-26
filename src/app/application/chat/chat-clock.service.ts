import { Injectable } from '@angular/core';
import { Network } from '@axe/core/index';
import { Logger } from '@axe/core/logging/logger';
import { debounce } from '@axe/core/util/debounce';

const HOURS = 60 * 60 * 1000;

/**
 * The clock chat lines are stamped with, set by a time server rather than by this machine's own.
 *
 * Lines are ordered by the time they are stamped with, so peers whose own clocks disagree would
 * otherwise interleave wrongly.
 */
@Injectable({ providedIn: 'root' })
export class ChatClockService {
  private readonly recalibrate = debounce(() => this.calibrate(), 6 * HOURS);
  private timeOffset: number = Date.now();
  private performanceOffset: number = performance.now();

  private ntpApiUrls: string[] = ['https://worldtimeapi.org/api/ip'];

  /**
   * Sets the clock by a public time server, then again every six hours; on a room server, by the
   * server's clock, which it told the seat on letting it in, asking nobody else.
   *
   * A failed request keeps the clock as it was and tries again on the same schedule. Calling it
   * while a check is already scheduled does nothing.
   */
  calibrate() {
    const serverOffset = Network.serverClockOffset;
    if (serverOffset !== null) {
      this.timeOffset = Date.now() + serverOffset;
      this.performanceOffset = performance.now();
      return;
    }
    if (this.recalibrate.pending()) {
      return;
    }
    const index = Math.floor(Math.random() * this.ntpApiUrls.length);
    const ntpApiUrl = this.ntpApiUrls[index];
    const sendTime = performance.now();
    fetch(ntpApiUrl)
      .then((response) => {
        if (response.ok) return response.json();
        throw new Error('Network response was not ok.');
      })
      .then((jsonObj) => {
        const endTime = performance.now();
        const latency = (endTime - sendTime) / 2;
        const timeobj = jsonObj;
        const st: number = new Date(timeobj.utc_datetime).getTime();
        const fixedTime = st + latency;
        this.timeOffset = fixedTime;
        this.performanceOffset = endTime;
        Logger.info(`[TimeSync] 時刻同期完了 (過延: ${latency.toFixed(0)}ms, offset: ${fixedTime.toFixed(0)})`);
        this.recalibrate();
      })
      .catch((error) => {
        Logger.warn('[TimeSync] 時刻同期失敗', error.message);
        this.recalibrate();
      });
    this.recalibrate();
  }

  /** The current time in milliseconds by the calibrated clock, which is what lines are stamped with. */
  now(): number {
    return Math.floor(this.timeOffset + (performance.now() - this.performanceOffset));
  }
}
