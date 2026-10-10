import { downloadBlob } from '@axe/core/util/download-blob';

describe('downloadBlob', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:stub://1');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('clicks a link to the blob under the name given', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const createSpy = vi.spyOn(document, 'createElement');

    downloadBlob(blob, 'hello.txt');

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    const anchor = createSpy.mock.results[0].value as HTMLAnchorElement;
    expect(anchor.tagName).toBe('A');
    expect(anchor.href).toContain('blob:stub://1');
    expect(anchor.download).toBe('hello.txt');
  });

  it('keeps the url until a browser that reads it after the click has had time to', () => {
    downloadBlob(new Blob(['hello']), 'hello.txt');

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stub://1');
  });
});
