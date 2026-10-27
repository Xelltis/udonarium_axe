import { ChatPaletteHandle, ChatPaletteRegistryService } from '@axe/application/chat/chat-palette-registry.service';

function handle(): ChatPaletteHandle {
  return { setCharacterById: vi.fn() };
}

describe('ChatPaletteRegistryService', () => {
  it('makes the last one registered the active one', () => {
    const service = new ChatPaletteRegistryService();
    const a = handle();
    const b = handle();

    expect(service.active()).toBeNull();
    service.register(a);
    expect(service.active()).toBe(a);
    service.register(b);
    expect(service.active()).toBe(b);
  });

  it('falls back to the last of the rest when that one goes', () => {
    const service = new ChatPaletteRegistryService();
    const a = handle();
    const b = handle();
    service.register(a);
    service.register(b);

    service.unregister(b);
    expect(service.active()).toBe(a);
    service.unregister(a);
    expect(service.active()).toBeNull();
  });

  it('leaves the active one alone when another goes', () => {
    const service = new ChatPaletteRegistryService();
    const a = handle();
    const b = handle();
    service.register(a);
    service.register(b);

    service.unregister(a);
    expect(service.active()).toBe(b);
  });
});
