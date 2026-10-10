import { TestBed } from '@angular/core/testing';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import {
  BUTTON_GUIDE_KEEP_ATTRIBUTE,
  ButtonGuideEventHandlerService,
} from '@axe/features/button-guide/button-guide-event-handler.service';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ButtonGuideEventHandlerService', () => {
  let guide: ButtonGuideService;
  const planted: HTMLElement[] = [];

  function press(key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  function plant(tag: string): HTMLElement {
    const element = document.createElement(tag);
    document.body.appendChild(element);
    planted.push(element);
    return element;
  }

  /** Lets the effects that follow the guide in and out settle. */
  function settle(): void {
    TestBed.tick();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.inject(ButtonGuideEventHandlerService);
    guide = TestBed.inject(ButtonGuideService);
  });

  afterEach(() => {
    TestBed.inject(VisualNovelModeService).deactivate();
    for (const element of planted.splice(0)) element.remove();
    TestBed.resetTestingModule();
  });

  it('brings the guide out and puts it away with the question mark, keeping the key to itself', () => {
    const event = press('?');
    expect(guide.shown()).toBe(true);
    expect(event.defaultPrevented).toBe(true);

    press('?');
    expect(guide.shown()).toBe(false);
  });

  it('puts the guide away with escape', () => {
    press('?');
    press('Escape');

    expect(guide.shown()).toBe(false);
  });

  it('leaves the question mark to a field being typed in', () => {
    press('?', plant('input'));

    expect(guide.shown()).toBe(false);
  });

  it('puts the guide away at a press anywhere', () => {
    guide.show();
    settle();

    plant('div').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(guide.shown()).toBe(false);
  });

  it('keeps the guide out for a press on what answers presses itself while it is out', () => {
    const drawer = plant('nav');
    drawer.setAttribute(BUTTON_GUIDE_KEEP_ATTRIBUTE, '');
    const item = document.createElement('li');
    drawer.appendChild(item);
    guide.show();
    settle();

    item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(guide.shown()).toBe(true);
  });

  it('leaves the question mark to novel mode, and puts the guide away when novel mode opens', () => {
    guide.show();
    settle();
    TestBed.inject(VisualNovelModeService).activate();
    settle();
    expect(guide.shown()).toBe(false);

    press('?');
    expect(guide.shown()).toBe(false);
  });
});
