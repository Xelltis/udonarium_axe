import { peerStatsUpdated$ } from '@axe/core/network/peer-stats-events';
import { ResettableTimeout } from '@axe/core/util/resettable-timeout';

export interface WebRTCConnection {
  open: boolean;
  updateStatsAsync(): Promise<void>;
}

export class WebRTCStatsMonitor {
  private static updateWebRTCStatsTimer: ResettableTimeout | null = null;
  private static monitoringConnections: Set<WebRTCConnection> = new Set();

  private constructor() {}

  /**
   * Starts polling a connection's WebRTC stats, updating them once straight away.
   *
   * Every monitored connection is polled together, every two seconds plus one per connection up to
   * eight. A connection found closed is dropped at the next poll, and a poll that updated or
   * dropped anything emits the peer stats event.
   */
  static add(connection: WebRTCConnection) {
    this.monitoringConnections.add(connection);
    connection.updateStatsAsync();
    this.restart();
  }

  /** Stops polling a connection's stats; once none is left, polling ends at the next scheduled poll. */
  static remove(connection: WebRTCConnection) {
    this.monitoringConnections.delete(connection);
  }

  private static restart() {
    const intervalMs = Math.min(2000 + 1000 * this.monitoringConnections.size, 8000);
    if (this.updateWebRTCStatsTimer === null) {
      this.updateWebRTCStatsTimer = new ResettableTimeout(() => this.doMonitoringAsync(), intervalMs);
    } else if (!this.updateWebRTCStatsTimer.isActive) {
      this.updateWebRTCStatsTimer.reset(intervalMs);
    }
  }

  private static async doMonitoringAsync() {
    const toRemove: WebRTCConnection[] = [];
    let updated = false;
    for (const connection of this.monitoringConnections) {
      if (connection.open) {
        await connection.updateStatsAsync();
        updated = true;
      } else {
        toRemove.push(connection);
      }
    }
    for (const connection of toRemove) {
      this.remove(connection);
    }
    if (updated || toRemove.length > 0) peerStatsUpdated$.emit();
    if (this.monitoringConnections.size === 0) {
      this.updateWebRTCStatsTimer = null;
      return;
    }
    this.restart();
  }
}
