import { computed, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/network/network';
import { MAX_REPORT_REASON_LENGTH, ReportTarget } from '@axe/core/network/server/server-protocol';
import { AssetHttpStore, ReportResult } from '@axe/core/storage/asset-http-store';

/** What a report is about: a picture or sound of the room by its identifier, or the room, with the name it goes by. */
export interface ReportSubject {
  target: ReportTarget;
  /** The SHA-256 of the picture or sound, for a report of one. */
  assetId?: string;
  /** What the reader knows it by: the file's name, or the room's. */
  name: string;
}

/**
 * Reports something in the room to the room server's operator, as anyone seated in a room on a room
 * server may, whatever their role. The operator reads it with who sent it, to tell false reports apart.
 */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly assetHttpStore = inject(AssetHttpStore);

  /** Whether this seat may report: in a room on a room server, where the room's store is in reach. */
  readonly canReport = computed(() => {
    this.objectChange.networkVersion();
    return Network.transport === 'server' && Network.peerContext.isRoom && this.assetHttpStore.isEnabled;
  });

  /** Whether a picture or sound may be reported: one a person added, named by its hash. */
  isReportable(assetId: string): boolean {
    return AssetHttpStore.isAssetId(assetId);
  }

  /**
   * Sends a report with the reason the reader gave, trimmed. A reason that is empty or too long, or a
   * picture or sound not named by its hash, is refused before anything is sent.
   */
  send(subject: ReportSubject, reason: string): Promise<ReportResult> {
    const trimmed = reason.trim();
    if (trimmed.length === 0 || MAX_REPORT_REASON_LENGTH < trimmed.length) return Promise.resolve('refused');
    if (subject.target === 'room') return this.assetHttpStore.report({ target: 'room', reason: trimmed });
    if (!subject.assetId || !this.isReportable(subject.assetId)) return Promise.resolve('refused');
    return this.assetHttpStore.report({ target: 'asset', assetId: subject.assetId, reason: trimmed });
  }
}
