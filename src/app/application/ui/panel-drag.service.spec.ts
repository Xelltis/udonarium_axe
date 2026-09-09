import { PanelDragService, PanelDropFrame } from '@axe/application/ui/panel-drag.service';
import { PanelDropZone } from '@axe/application/ui/panel-drag-helpers';

function frameAt(key: string, zone: PanelDropZone | null): PanelDropFrame {
  return {
    frameKey: key,
    openTab: (() => ({})) as unknown as PanelDropFrame['openTab'],
    setInitialRotation: () => undefined,
    claimSelf: () => undefined,
    closeTab: () => undefined,
    measureDropZone: () => zone,
    handOverAll: () => [],
    handOver: () => null,
    takeIn: () => undefined,
    panelCount: () => 1,
    dismissFrame: () => undefined,
  };
}

const bar = { left: 0, top: 0, right: 100, bottom: 28 };

describe('PanelDragService', () => {
  let service: PanelDragService;

  beforeEach(() => {
    service = new PanelDragService();
  });

  it('holds nothing until a drag begins', () => {
    expect(service.held()).toBeNull();
    expect(service.target()).toBeNull();
  });

  it('finds the frame the pointer is over', () => {
    const held = frameAt('held', { bar, strip: null, z: 1 });
    const other = frameAt('other', { bar, strip: null, z: 1 });
    service.register(held);
    service.register(other);

    service.begin(held);
    service.move(50, 14);

    expect(service.target()).toBe(other);
  });

  it('never lands a frame on itself', () => {
    const held = frameAt('held', { bar, strip: null, z: 1 });
    service.register(held);

    service.begin(held);
    service.move(50, 14);

    expect(service.target()).toBeNull();
  });

  it('passes over a frame that will take nothing in', () => {
    const held = frameAt('held', { bar, strip: null, z: 1 });
    service.register(held);
    service.register(frameAt('shut', null));

    service.begin(held);
    service.move(50, 14);

    expect(service.target()).toBeNull();
  });

  it('says where the drag landed, and forgets it', () => {
    const held = frameAt('held', { bar, strip: null, z: 1 });
    const other = frameAt('other', { bar, strip: null, z: 1 });
    service.register(held);
    service.register(other);
    service.begin(held);
    service.move(50, 14);

    expect(service.end()).toBe(other);
    expect(service.held()).toBeNull();
    expect(service.target()).toBeNull();
  });

  it('lands nothing where the pointer ended up over no bar', () => {
    const held = frameAt('held', { bar, strip: null, z: 1 });
    service.register(held);
    service.register(frameAt('other', { bar, strip: null, z: 1 }));
    service.begin(held);
    service.move(50, 14);

    service.move(50, 400);

    expect(service.end()).toBeNull();
  });

  it('forgets a frame that has gone, drag and all', () => {
    const held = frameAt('held', { bar, strip: null, z: 1 });
    const other = frameAt('other', { bar, strip: null, z: 1 });
    service.register(held);
    const forget = service.register(other);
    service.begin(held);
    service.move(50, 14);

    forget();
    service.move(50, 14);

    expect(service.target()).toBeNull();
  });

  it('gives up the drag when it is called off', () => {
    const held = frameAt('held', { bar, strip: null, z: 1 });
    service.register(held);
    service.begin(held);

    service.cancel();

    expect(service.held()).toBeNull();
  });
});
