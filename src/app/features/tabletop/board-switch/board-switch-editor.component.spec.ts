import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SwitchPressService } from '@axe/application/tabletop/switch-press.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BoardSwitch } from '@axe/domain/tabletop/board-switch/board-switch';
import { BoardSwitchEditorComponent } from '@axe/features/tabletop/board-switch/board-switch-editor.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BoardSwitchEditorComponent', () => {
  let fixture: ComponentFixture<BoardSwitchEditorComponent>;
  let target: BoardSwitch;

  function field<T extends HTMLElement>(testId: string): T {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as T;
  }

  function type(testId: string, value: string, event = 'input'): void {
    const element = field<HTMLInputElement>(testId);
    element.value = value;
    element.dispatchEvent(new Event(event, { bubbles: true }));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BoardSwitchEditorComponent], providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor().role = PeerRole.GameMaster;
    target = new BoardSwitch();
    target.initialize();
    fixture = TestBed.createComponent(BoardSwitchEditorComponent);
    fixture.componentInstance.target.set(target);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
  });

  it('keeps every change made in quick succession, before the room has heard of the first', () => {
    type('board-switch-label', '宝箱を開ける');
    type('board-switch-speaker', 'host', 'change');
    field<HTMLButtonElement>('switch-action-add-say').click();
    fixture.detectChanges();
    type('switch-action-text', 'ギィ…と蓋が開いた');

    expect(target.def).toMatchObject({
      label: '宝箱を開ける',
      speaker: 'host',
      actions: [{ kind: 'say', text: 'ギィ…と蓋が開いた' }],
    });
  });

  it('tries the switch from the panel without counting it, and says why it came to nothing', async () => {
    const press = vi.spyOn(TestBed.inject(SwitchPressService), 'press').mockResolvedValue('nothing');

    field<HTMLButtonElement>('board-switch-try').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(press).toHaveBeenCalledWith(target, { trial: true });
    expect(field('board-switch-tried').textContent?.trim()).toBe('何もしないスイッチです');
  });

  it('shows a player nothing of what the switch does', () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    fixture = TestBed.createComponent(BoardSwitchEditorComponent);
    fixture.componentInstance.target.set(target);
    fixture.detectChanges();

    expect(field('board-switch-editor')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('GM だけ');
  });
});
