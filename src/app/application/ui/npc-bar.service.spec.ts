import { NpcBarService } from '@axe/application/ui/npc-bar.service';

describe('NpcBarService', () => {
  it('opens, closes and toggles', () => {
    const service = new NpcBarService();
    expect(service.isOpen()).toBe(false);

    service.open();
    expect(service.isOpen()).toBe(true);

    service.close();
    expect(service.isOpen()).toBe(false);

    service.toggle();
    expect(service.isOpen()).toBe(true);
    service.toggle();
    expect(service.isOpen()).toBe(false);
  });
});
