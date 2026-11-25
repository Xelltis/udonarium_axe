import { TestBed } from '@angular/core/testing';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TargetListPanelComponent } from '@axe/features/tabletop/target-list/target-list-panel.component';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TargetListPanelComponent', () => {
  const made: GameCharacter[] = [];

  function piece(name: string, side = '', x = 0): GameCharacter {
    const one = GameCharacter.create(name, 1, '');
    one.location = { name: 'table', x, y: 0 };
    one.battleSide = side;
    made.push(one);
    return one;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TargetListPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    beMyself('me');
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
    PeerCursor.myCursor.role = PeerRole.Player;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const one of made.splice(0)) one.destroy();
    PeerCursor.myCursor = null!;
  });

  function render() {
    const fixture = TestBed.createComponent(TargetListPanelComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const rows = () =>
      [...element.querySelectorAll<HTMLButtonElement>('[data-testid="target-list-row"]')].map((row) =>
        (row.textContent ?? '').replace(/\s+/g, ' ').trim()
      );
    return { fixture, element, rows };
  }

  it('lists the pieces this seat may aim at by the side of the fight each stands on, the first of its bars beside it', () => {
    piece('勇者', 'left');
    piece('ゴブリン', 'right');
    piece('村人');
    const { fixture } = render();

    const sections = fixture.componentInstance.sections();

    expect(sections.map((section) => [section.side, section.rows.map((row) => row.name)])).toEqual([
      ['left', ['勇者']],
      ['right', ['ゴブリン']],
      ['none', ['村人']],
    ]);
    expect(sections[0].rows[0].gauge).toMatch(/^HP \d+\/\d+$/);
  });

  it('aims at the piece of a row pressed, and lets go of it at a second press', () => {
    const goblin = piece('ゴブリン', 'right');
    const { fixture, element } = render();
    const row = () => element.querySelector<HTMLButtonElement>('[data-testid="target-list-row"]')!;

    row().click();
    fixture.detectChanges();
    expect([goblin.targeted, row().getAttribute('aria-pressed')]).toEqual([true, 'true']);

    row().click();
    fixture.detectChanges();
    expect([goblin.targeted, row().getAttribute('aria-pressed')]).toEqual([false, 'false']);
  });

  it('lists no piece this seat cannot see, and names one whose name is kept from it as hidden', () => {
    const unseen = piece('伏兵', 'right');
    const masked = piece('黒幕', 'right');
    masked.hideName = true;
    vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockImplementation((one) => one !== unseen);
    const { rows } = render();

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).not.toContain('黒幕');
  });

  it('says there is nothing to aim at where there is nothing', () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="target-list-row"]')).toBeNull();
    expect(element.textContent).toContain('ターゲットにできるコマがありません');
  });
});
