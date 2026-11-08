import { lazyLoadsSettled, trackLazyLoad } from '@axe/core/util/lazy-loads';

describe('lazy loads of code under way', () => {
  it('settles at once with nothing under way', async () => {
    await expect(lazyLoadsSettled()).resolves.toBeUndefined();
  });

  it('settles only once every load under way has arrived or failed, handing each back as it is', async () => {
    let arrive!: (value: string) => void;
    let fail!: (reason: Error) => void;
    const arriving = trackLazyLoad(new Promise<string>((resolve) => (arrive = resolve)));
    const failing = trackLazyLoad(new Promise<string>((_resolve, reject) => (fail = reject)));
    failing.catch(() => undefined);
    let settled = false;
    void lazyLoadsSettled().then(() => (settled = true));

    arrive('part');
    await arriving;
    await Promise.resolve();
    expect(settled).toBe(false);

    fail(new Error('gone'));
    await expect(failing).rejects.toThrow('gone');
    await vi.waitFor(() => expect(settled).toBe(true));
    await expect(arriving).resolves.toBe('part');
  });
});
