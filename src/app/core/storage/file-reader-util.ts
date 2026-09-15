import { sha256Hex } from '@axe/core/util/crypto-util';

/** Reads a blob's bytes, rejecting with the reader's event when reading fails or is aborted. */
export function readAsArrayBufferAsync(blob: Blob): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as ArrayBuffer);
    };
    reader.onabort = reader.onerror = (e) => {
      reject(e);
    };
    reader.readAsArrayBuffer(blob);
  });
}

/** Reads a blob as UTF-8 text, rejecting when reading fails or is aborted. */
export function readAsTextAsync(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onabort = reader.onerror = (e) => {
      reject(e);
    };
    reader.readAsText(blob);
  });
}

/** Reads a blob as a data URL, rejecting when reading fails or is aborted. */
export function readAsDataURLAsync(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onabort = reader.onerror = (e) => {
      reject(e);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * The SHA-256 of the bytes as lowercase hex, which is the identifier added images and
 * audio are stored and shared under.
 */
export async function calcSHA256Async(arrayBuffer: ArrayBuffer): Promise<string>;
export async function calcSHA256Async(blob: Blob): Promise<string>;
export async function calcSHA256Async(arg: ArrayBuffer | Blob): Promise<string> {
  if (arg instanceof Blob) {
    arg = await readAsArrayBufferAsync(arg);
  }
  return sha256Hex(arg);
}
