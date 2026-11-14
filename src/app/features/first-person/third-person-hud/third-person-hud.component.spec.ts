import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { ThirdPersonService } from '@axe/application/tabletop/third-person.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { VisualNovelModeService } from '@axe/application/ui/visual-novel-mode.service';
import { latticeOf } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { GridType } from '@axe/domain/tabletop/game-table';
import { ThirdPersonHudComponent } from '@axe/features/first-person/third-person-hud/third-person-hud.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ThirdPersonHudComponent', () => {
  let fixture: ComponentFixture<ThirdPersonHudComponent>;
  let host: HTMLElement;
  const piece = signal<{ name: string } | null>({ name: '盗賊' });
  const novel = signal(false);
  const thirdPerson = {
    piece,
    walk: vi.fn(() => Promise.resolve(true)),
    turn: vi.fn(() => Promise.resolve(true)),
    stop: vi.fn(),
  };
  const modal = { isShow: false };
  let planning = false;

  /** Presses a key on the page, answering the event so what became of it can be read. */
  function key(code: string, init: KeyboardEventInit = {}, target: EventTarget = document): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  beforeEach(async () => {
    piece.set({ name: '盗賊' });
    novel.set(false);
    modal.isShow = false;
    planning = false;
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [ThirdPersonHudComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: ThirdPersonService, useValue: thirdPerson },
        { provide: FirstPersonService, useValue: { lattice: signal(latticeOf(GridType.SQUARE)) } },
        { provide: ModalService, useValue: modal },
        { provide: VisualNovelModeService, useValue: { active: novel } },
        { provide: MovePlannerService, useValue: { isPlanning: () => planning } },
      ],
    });
    fixture = TestBed.createComponent(ThirdPersonHudComponent);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  it('names the piece followed', () => {
    expect(host.textContent).toContain('盗賊 を後ろから追っています');
  });

  it('stops following from its button', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="third-person-stop"]')!.click();

    expect(thirdPerson.stop).toHaveBeenCalledTimes(1);
  });

  it('walks the piece from the move keys, keeping the key from the table', () => {
    const forward = key('KeyW');
    key('ArrowDown');

    expect(thirdPerson.walk.mock.calls).toEqual([['forward'], ['back']]);
    expect(forward.defaultPrevented).toBe(true);
  });

  it('turns the piece from the turn keys', () => {
    key('KeyQ');
    key('ArrowRight');

    expect(thirdPerson.turn.mock.calls).toEqual([[-1], [1]]);
  });

  it('stops following on Escape', () => {
    const escape = key('Escape');

    expect(thirdPerson.stop).toHaveBeenCalledTimes(1);
    expect(escape.defaultPrevented).toBe(true);
  });

  it('leaves the keys that only mean something looking out of the piece to the table', () => {
    for (const code of ['Space', 'KeyF', 'KeyT', 'Enter', 'KeyX']) expect(key(code).defaultPrevented).toBe(false);

    expect(thirdPerson.walk).not.toHaveBeenCalled();
    expect(thirdPerson.turn).not.toHaveBeenCalled();
    expect(thirdPerson.stop).not.toHaveBeenCalled();
  });

  it('leaves a key typed into a field, a chord, and a key something else already took', () => {
    const field = document.createElement('input');
    document.body.append(field);
    try {
      key('KeyW', {}, field);
      key('KeyW', { ctrlKey: true });
      const taken = new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true, cancelable: true });
      taken.preventDefault();
      document.dispatchEvent(taken);
    } finally {
      field.remove();
    }

    expect(thirdPerson.walk).not.toHaveBeenCalled();
  });

  it('leaves the keys alone while a dialogue is open, a scene is read or a move is planned', () => {
    modal.isShow = true;
    key('KeyW');
    modal.isShow = false;
    novel.set(true);
    key('KeyW');
    novel.set(false);
    planning = true;
    key('KeyW');

    expect(thirdPerson.walk).not.toHaveBeenCalled();

    planning = false;
    key('KeyW');
    expect(thirdPerson.walk).toHaveBeenCalledTimes(1);
  });

  it('hears no more keys once it is gone', () => {
    key('KeyW');
    fixture.destroy();

    key('KeyW');

    expect(thirdPerson.walk).toHaveBeenCalledTimes(1);
  });
});
