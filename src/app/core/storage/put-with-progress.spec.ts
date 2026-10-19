import { putWithProgress } from '@axe/core/storage/put-with-progress';

/** An XMLHttpRequest that answers only when told to, and says how it was used. */
class FakeXhr {
  readonly upload: { onprogress: (() => void) | null } = { onprogress: null };
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 0;
  statusText = '';
  responseText = '';
  method = '';
  url = '';
  readonly headers: Record<string, string> = {};
  sent: unknown = null;
  aborted = false;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  send(body: unknown): void {
    this.sent = body;
  }
  abort(): void {
    this.aborted = true;
  }
  answer(status: number, responseText = ''): void {
    this.status = status;
    this.responseText = responseText;
    this.onload?.();
  }
}

describe('putWithProgress', () => {
  let xhr: FakeXhr;
  const body = new Blob([new Uint8Array([1, 2, 3])]);
  let deadline: number | undefined;
  const put = () =>
    putWithProgress(
      'https://rooms.example/a',
      body,
      { Authorization: 'Bearer t' },
      { idleMs: 60_000, deadline },
      () => {
        xhr = new FakeXhr();
        return xhr as unknown as XMLHttpRequest;
      }
    );

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    deadline = undefined;
  });
  afterEach(() => vi.useRealTimers());

  it('answers with the body the server sent, as the reason it turned the bytes away', async () => {
    const result = put();
    xhr.answer(403, '{"error":"not-a-player"}');

    expect(await (await result).json()).toEqual({ error: 'not-a-player' });
  });

  it('answers with no body for a status that carries none', async () => {
    const result = put();
    xhr.answer(204);

    expect((await result).status).toBe(204);
  });

  it('sends the bytes with their headers and answers with the status', async () => {
    const result = put();
    xhr.answer(201);

    expect((await result).status).toBe(201);
    expect([xhr.method, xhr.url, xhr.headers, xhr.sent]).toEqual([
      'PUT',
      'https://rooms.example/a',
      { Authorization: 'Bearer t' },
      body,
    ]);
  });

  it('waits for an upload that keeps going, however long it takes in all', async () => {
    const result = put();
    for (let step = 0; step < 5; step++) {
      await vi.advanceTimersByTimeAsync(50_000);
      xhr.upload.onprogress?.();
    }
    xhr.answer(201);

    expect((await result).status).toBe(201);
    expect(xhr.aborted).toBe(false);
  });

  it('gives up on an upload once a minute passes with nothing getting through', async () => {
    const result = put();
    const outcome = result.catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(30_000);
    xhr.upload.onprogress?.();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(xhr.aborted).toBe(true);
  });

  it('gives up on one still going once the time it was given runs out', async () => {
    deadline = Date.now() + 100_000;
    const result = put();
    const outcome = result.catch((reason: unknown) => reason);
    for (let step = 0; step < 3; step++) {
      await vi.advanceTimersByTimeAsync(30_000);
      xhr.upload.onprogress?.();
    }
    expect(xhr.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(xhr.aborted).toBe(true);
  });

  it('fails when the request does, or comes back with no status', async () => {
    const failed = put().catch((reason: unknown) => reason);
    xhr.onerror?.();
    expect(await failed).toBeInstanceOf(TypeError);

    const unanswered = put().catch((reason: unknown) => reason);
    xhr.answer(0);
    expect(await unanswered).toBeInstanceOf(TypeError);
  });
});
