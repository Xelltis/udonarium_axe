import { compressIfSmaller, splitAtFileChunks } from '@axe/core/network/frame-codec';
import { ClientMessage, EventContext, SendMessage } from '@axe/core/network/server/server-protocol';
import { decompressIfNeeded } from '@axe/core/util/compress';
import * as MessagePack from '@axe/core/util/message-pack';

/**
 * The most a frame of events is encoded to before its events are split over more frames. The
 * server takes far more, but one large frame holds up everything queued behind it.
 */
export const MAX_FRAME_BYTES = 256 * 1024;

/** A frame a WebSocket can send: the same bytes, copied only when they sit on a shared buffer. */
function asFrame(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes);
}

/** One client message as a frame, gzipped when that is allowed and makes it smaller. */
export async function encodeFrame(message: ClientMessage, compressible = true): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = MessagePack.encode(message);
  return asFrame(compressible ? (await compressIfSmaller(bytes)).bytes : bytes);
}

function sendMessage(events: EventContext[], to: string | undefined): SendMessage {
  return to == null ? { type: 'send', events } : { type: 'send', to, events };
}

/** The events halved until each part encodes within MAX_FRAME_BYTES, or is a single event. */
function encodeToFit(events: EventContext[], to: string | undefined): Uint8Array[] {
  const bytes = MessagePack.encode(sendMessage(events, to));
  if (events.length <= 1 || bytes.byteLength <= MAX_FRAME_BYTES) return [bytes];
  const half = Math.ceil(events.length / 2);
  return [...encodeToFit(events.slice(0, half), to), ...encodeToFit(events.slice(half), to)];
}

/**
 * The frames a batch of events goes out in, in order. The pieces of a file go in frames of their
 * own and are not gzipped, being compressed already; the other events are gzipped when that helps.
 */
export async function encodeSendFrames(events: EventContext[], to?: string): Promise<Uint8Array<ArrayBuffer>[]> {
  const frames: Uint8Array<ArrayBuffer>[] = [];
  for (const run of splitAtFileChunks(events)) {
    for (const bytes of encodeToFit(run.messages as EventContext[], to)) {
      frames.push(asFrame(run.carriesFileChunks ? bytes : (await compressIfSmaller(bytes)).bytes));
    }
  }
  return frames;
}

/** A binary frame from the server, gunzipped when it is gzip, decoded from MessagePack. */
export async function decodeFrame(bytes: Uint8Array): Promise<unknown> {
  return MessagePack.decode(await decompressIfNeeded(bytes));
}
