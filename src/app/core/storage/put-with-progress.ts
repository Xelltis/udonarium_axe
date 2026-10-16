/**
 * Sends bytes with a PUT and answers with the response's status, given up on once `idleMs` passes
 * with nothing sent or received: an upload still going, however slowly, is waited for, while one on
 * a line gone quiet is not. Unlike fetch, XMLHttpRequest tells how far an upload has got.
 *
 * Rejects with a TypeError when the request fails, and with an AbortError when it goes quiet.
 */
export function putWithProgress(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  idleMs: number,
  open: () => XMLHttpRequest = () => new XMLHttpRequest()
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = open();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const stillGoing = () => {
      stop();
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
      else resolve(new Response(null, { status: xhr.status, statusText: xhr.statusText }));
    };
    xhr.onerror = () => {
      stop();
      reject(new TypeError('the upload failed'));
    };
    stillGoing();
    xhr.send(body);
  });
}
