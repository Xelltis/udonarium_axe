import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack';

/** Serialises a value to MessagePack bytes, the binary form data is sent to peers in. */
export function encode(object: unknown): Uint8Array {
  return msgpackEncode(object);
}

/** Reads a value back from MessagePack bytes; checking its shape is left to the caller. */
export function decode(buffer: Uint8Array): unknown {
  return msgpackDecode(buffer);
}
