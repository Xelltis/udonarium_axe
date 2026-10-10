describe('vi.waitFor in these specs', () => {
  it('waits longer than a second for a wait that names no time', async () => {
    const start = Date.now();

    await vi.waitFor(() => expect(Date.now() - start).toBeGreaterThan(1500));
  });

  it('keeps the time a wait names', async () => {
    await expect(vi.waitFor(() => expect(false).toBe(true), { timeout: 50 })).rejects.toThrow();
  });
});
