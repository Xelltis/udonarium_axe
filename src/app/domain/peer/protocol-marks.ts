import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/** The marks on a cursor that say which protocols its version runs, each `1` once it does. */
export type ProtocolMark = 'zoneProtocol' | 'groundProtocol' | 'turnProtocol';

/** Every protocol this version runs, in the order the marks are said. */
export const PROTOCOL_MARKS: readonly ProtocolMark[] = ['zoneProtocol', 'groundProtocol', 'turnProtocol'];

/** Says every protocol this version runs on a cursor, each as `1`, writing only the marks not said yet. */
export function markProtocols(cursor: Pick<PeerCursor, ProtocolMark>): void {
  for (const mark of PROTOCOL_MARKS) {
    if (cursor[mark] !== '1') cursor[mark] = '1';
  }
}
