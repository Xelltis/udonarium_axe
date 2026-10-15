import { TestBed } from '@angular/core/testing';
import { localDispatch, networkMessage$, receiveEvents } from '@axe/core/network/network-messaging';
import { VisualNovelModeService, VN_MODE_EVENT } from '@axe/features/visual-novel/visual-novel-mode.service';

describe('VisualNovelModeService', () => {
  let service: VisualNovelModeService;
  let announced: boolean[];
  let off: () => void;

  beforeEach(() => {
    announced = [];
    off = networkMessage$.subscribe((message) => {
      if (message.eventName === VN_MODE_EVENT) announced.push(Boolean((message.data as { active: boolean }).active));
    });
    TestBed.configureTestingModule({});
    service = TestBed.inject(VisualNovelModeService);
  });

  afterEach(() => {
    off();
  });

  it('starts inactive', () => {
    expect(service.active()).toBe(false);
  });

  it('goes active and inactive on request', () => {
    service.activate();
    expect(service.active()).toBe(true);
    service.deactivate();
    expect(service.active()).toBe(false);
  });

  it('flips between them on a toggle', () => {
    service.toggle();
    expect(service.active()).toBe(true);
    service.toggle();
    expect(service.active()).toBe(false);
  });

  it('tells this end about the switch so it can be recorded', () => {
    service.activate();
    service.deactivate();
    expect(announced).toEqual([true, false]);
  });

  it('says nothing when nothing changed', () => {
    service.deactivate();
    service.activate();
    service.activate();
    expect(announced).toEqual([true]);
  });

  it('follows word from elsewhere', () => {
    localDispatch(VN_MODE_EVENT, { active: true });
    expect(service.active()).toBe(true);

    localDispatch(VN_MODE_EVENT, { active: false });
    expect(service.active()).toBe(false);
  });

  it('takes no word of it from another seat, the mode being this screen’s own', () => {
    receiveEvents([{ eventName: VN_MODE_EVENT, data: { active: true }, sendFrom: 'peer-a' }]);

    expect(service.active()).toBe(false);
  });

  it('does not pass that word on again', () => {
    localDispatch(VN_MODE_EVENT, { active: true });
    expect(announced).toEqual([true]);
    expect(service.active()).toBe(true);
  });
});
