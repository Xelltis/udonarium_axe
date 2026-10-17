/** How long an upload is waited for: while bytes keep moving, and, if given, until a time. */
export interface UploadLimits {
  /** How long it may go with nothing sent or received. */
  idleMs: number;
  /** The time, in this page's milliseconds, by which it must be done however it is going. */
  deadline?: number;
}

/** The statuses whose responses carry no body. */
const BODILESS_STATUSES: ReadonlySet<number> = new Set([101, 204, 205, 304]);

/**
 * Sends bytes with a PUT and answers with the response's status and body, given up on once `idleMs` passes
 * with nothing sent or received: an upload still going, however slowly, is waited for, while one on
 * a line gone quiet is not. Unlike fetch, XMLHttpRequest tells how far an upload has got. One with a
 * `deadline`, as a place to put the bytes is held only so long, is given up on then too.
 *
 * Rejects with a TypeError when the request fails, and with an AbortError when it goes quiet or
 * runs out of time.
 */
export function putWithProgress(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  limits: UploadLimits,
  open: () => XMLHttpRequest = () => new XMLHttpRequest()
): Promise<Response> {
  const { idleMs, deadline } = limits;
  return new Promise((resolve, reject) => {
    const xhr = open();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastCall: ReturnType<typeof setTimeout> | null = null;
    const stopWaiting = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const stop = () => {
      stopWaiting();
      if (lastCall !== null) clearTimeout(lastCall);
      lastCall = null;
    };
    const stillGoing = () => {
      stopWaiting();
      timer = setTimeout(() => {
        timer = null;
        xhr.abort();
        reject(new DOMException('the upload went quiet', 'AbortError'));
      }, idleMs);
    };
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = stillGoing;
    xhr.onprogress = stillGoing;
    xhr.onload = () => {
      stop();
      if (xhr.status < 200 || 599 < xhr.status) reject(new TypeError('the upload got no answer'));
      else {
        const text = BODILESS_STATUSES.has(xhr.status) || xhr.responseText === '' ? null : xhr.responseText;
        resolve(new Response(text, { status: xhr.status, statusText: xhr.statusText }));
      }
    };
    xhr.onerror = () => {
      stop();
      reject(new TypeError('the upload failed'));
    };
    stillGoing();
    if (deadline !== undefined) {
      lastCall = setTimeout(
        () => {
          stop();
          xhr.abort();
          reject(new DOMException('the upload ran out of time', 'AbortError'));
        },
        Math.max(0, deadline - Date.now())
      );
    }
    xhr.send(body);
  });
}
