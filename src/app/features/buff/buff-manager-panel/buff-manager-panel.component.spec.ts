import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { BuffManagerPanelComponent } from '@axe/features/buff/buff-manager-panel/buff-manager-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BuffManagerPanelComponent', () => {
  let fixture: ComponentFixture<BuffManagerPanelComponent>;
  let component: BuffManagerPanelComponent;

  function makeCharacter(name: string): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.addExtendData();
    return character;
  }

  function onTable(characters: GameCharacter[]): void {
    vi.spyOn(TestBed.inject(GameObjectInventoryService).tableInventory, 'tabletopObjects', 'get').mockReturnValue(
      characters
    );
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [BuffManagerPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(BuffManagerPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves out the pieces carrying nothing', () => {
    const plain = makeCharacter('素のコマ');
    const buffed = makeCharacter('バフ持ち');
    buffed.buffs.addRound('猛攻撃', '命中+2', 3);
    onTable([plain, buffed]);

    expect(component.rows().map((row) => row.characterName)).toEqual(['バフ持ち']);
    expect(component.rows()[0].bars.map((bar) => bar.name)).toEqual(['猛攻撃']);
  });

  it('runs the chart from the round being played', () => {
    onTable([]);

    expect(component.columns()[0]).toBe(component.round());
  });

  it('holds a bar that outruns the chart to its edge', () => {
    const buffed = makeCharacter('長持ち');
    buffed.buffs.addRound('祝福', '', 400);
    onTable([buffed]);

    const bar = component.rows()[0].bars[0];
    expect(component.span()).toBe(60);
    expect(component.barWidth(bar)).toBe(component.span());
    expect(component.isRunningOff(bar)).toBe(true);
  });

  it('opens a bar for editing and closes it again', () => {
    const buffed = makeCharacter('バフ持ち');
    buffed.buffs.addRound('猛攻撃', '命中+2', 3);
    onTable([buffed]);
    const bar = component.rows()[0].bars[0];

    component.select(bar);
    expect(component.selectedElement()?.name).toBe('猛攻撃');

    component.select(bar);
    expect(component.selectedElement()).toBeNull();
  });

  it('writes an edit back onto the buff', () => {
    const buffed = makeCharacter('バフ持ち');
    buffed.buffs.addRound('猛攻撃', '命中+2', 3);
    onTable([buffed]);
    component.select(component.rows()[0].bars[0]);

    component.setRounds(5);
    component.setTiming('turnStart');
    component.setTrigger('術者');

    const bar = component.rows()[0].bars[0];
    expect(bar.rounds).toBe(5);
    expect(bar.timing).toBe('turnStart');
    expect(bar.trigger).toBe('術者');
  });

  it('shows the timing a buff already carries, rather than the first choice on the list', async () => {
    // A buff granted from the chat arrives with its timing already set. Read through a plain
    // value binding, the select would stand on whatever came first and say "round end" for a buff
    // that runs out on somebody's turn - right underneath, and wrong on the screen.
    const buffed = makeCharacter('バフ持ち');
    buffed.buffs.addRound('練技', '筋力+2', 3, { timing: 'turnStart', trigger: '術者' });
    onTable([buffed]);
    component.select(component.rows()[0].bars[0]);
    fixture.detectChanges();
    await fixture.whenStable();

    const timing = fixture.nativeElement.querySelector('select[name="selectedTiming"]') as HTMLSelectElement;
    const chosen = timing.options[timing.selectedIndex];

    expect(chosen?.textContent).toContain('手番開始');
  });

  it('takes a buff off the piece from the chart', () => {
    const buffed = makeCharacter('バフ持ち');
    buffed.buffs.addRound('猛攻撃', '命中+2', 3);
    onTable([buffed]);
    component.select(component.rows()[0].bars[0]);

    component.removeSelected();

    expect(component.rows()).toEqual([]);
  });

  describe('what the chart draws', () => {
    const all = (testId: string) =>
      Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`)) as HTMLElement[];

    it('gives every buff its own lane under the piece that carries it', () => {
      const first = makeCharacter('キャラA');
      first.buffs.addRound('猛攻撃', '命中+2', 3);
      first.buffs.addRound('祝福', '', 1);
      const second = makeCharacter('キャラB');
      second.buffs.addRound('守り', '', 2);
      onTable([first, second]);
      fixture.detectChanges();

      expect(all('buff-group-name').map((name) => name.textContent?.trim())).toEqual(['キャラA', 'キャラB']);
      expect(all('buff-bar')).toHaveLength(3);
    });

    it('starts every bar at the round being played, so a second buff does not slide right', () => {
      const character = makeCharacter('キャラA');
      character.buffs.addRound('長い', '', 3);
      character.buffs.addRound('短い', '', 1);
      onTable([character]);
      fixture.detectChanges();

      const width = component.columnWidth();
      expect(all('buff-bar').map((bar) => bar.style.width)).toEqual([`${width * 3}px`, `${width}px`]);
      expect(all('buff-bar').every((bar) => bar.style.marginLeft === '')).toBe(true);
    });

    it('draws one guide per round, headed by the round it stands for', () => {
      const character = makeCharacter('キャラA');
      character.buffs.addRound('猛攻撃', '', 2);
      onTable([character]);
      fixture.detectChanges();

      expect(all('round-column').map((column) => column.textContent?.trim())).toEqual(['1', '2', '3', '4']);
    });

    it('draws a column per round the longest buff runs, rather than cutting it to fit', () => {
      const character = makeCharacter('キャラA');
      character.buffs.addRound('祝福', '', 30);
      onTable([character]);

      expect(component.span()).toBe(30);
      expect(component.isRunningOff(component.rows()[0].bars[0])).toBe(false);
      expect(component.chartWidthPx()).toBe(component.labelWidthPx + 30 * component.columnWidth());
    });

    it('widens and narrows the chart on the zoom, and stops at both ends', () => {
      const character = makeCharacter('キャラA');
      character.buffs.addRound('猛攻撃', '', 2);
      onTable([character]);
      const start = component.columnWidth();

      component.zoomIn();
      expect(component.columnWidth()).toBeGreaterThan(start);
      expect(component.chartWidthPx()).toBe(component.labelWidthPx + component.span() * component.columnWidth());

      while (component.canZoomOut()) component.zoomOut();
      expect(component.columnWidth()).toBe(16);
      expect(component.canZoomOut()).toBe(false);

      while (component.canZoomIn()) component.zoomIn();
      expect(component.columnWidth()).toBe(112);
      expect(component.canZoomIn()).toBe(false);
    });

    it('scrolls the chart back to the round being played', () => {
      const character = makeCharacter('キャラA');
      character.buffs.addRound('祝福', '', 30);
      onTable([character]);
      fixture.detectChanges();

      const scroller = fixture.nativeElement.querySelector('.overflow-auto') as HTMLElement;
      scroller.scrollLeft = 400;
      component.backToNow();

      expect(scroller.scrollLeft).toBe(0);
    });

    it('counts the buffs as well as the pieces', () => {
      const first = makeCharacter('キャラA');
      first.buffs.addRound('猛攻撃', '', 3);
      first.buffs.addRound('祝福', '', 1);
      const second = makeCharacter('キャラB');
      second.buffs.addRound('守り', '', 2);
      onTable([first, second]);

      expect(component.rows()).toHaveLength(2);
      expect(component.buffCount()).toBe(3);
    });

    it('keeps the editor slot filled with a hint until a bar is picked', () => {
      const character = makeCharacter('キャラA');
      character.buffs.addRound('猛攻撃', '命中+2', 3);
      onTable([character]);
      fixture.detectChanges();

      expect(all('editor-hint')).toHaveLength(1);

      component.select(component.rows()[0].bars[0]);
      fixture.detectChanges();

      expect(all('editor-hint')).toHaveLength(0);
    });
  });

  describe('the command builder', () => {
    it('writes the plain form without a timing nobody asked to change', () => {
      component.builderName.set('猛攻撃');
      component.builderStatus.set('命中');
      component.builderOperator.set('+');
      component.builderAmount.set('2');
      component.builderRounds.set('3');

      expect(component.builderCommand()).toBe('&!猛攻撃/命中/+/2/3');
      expect(component.builderPreview()).toBe('命中+2');
    });

    it('carries the timing and the trigger once either is asked for', () => {
      component.builderName.set('練技');
      component.builderStatus.set('筋力');
      component.builderOperator.set('+');
      component.builderAmount.set('2');
      component.builderRounds.set('3');
      component.builderTiming.set('turnStart');
      component.builderTrigger.set('術者');

      expect(component.builderCommand()).toBe('&!練技/筋力/+/2/3/turnStart/術者');
    });

    it('says nothing about an effect it cannot read', () => {
      component.builderAmount.set('たくさん');

      expect(component.builderPreview()).toBe('');
    });
  });
});
