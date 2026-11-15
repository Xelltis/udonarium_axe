import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { resetCarriedOut$, type ResetCarriedOutEvent } from '@axe/core/event/domain-events';
import type { BuffRemovalRule } from '@axe/domain/character/buff-bulk-removal';
import { buffKindOf } from '@axe/domain/character/buff-kind';
import { buffEffectTimingOf, buffTimingOf, buffTriggerOf } from '@axe/domain/character/buff-timing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { type ResetRecord, undoReset } from '@axe/domain/character/piece-reset';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import type { ChatMessage } from '@axe/domain/chat/chat-message';
import { DataElement } from '@axe/domain/data/data-element';
import { applyBuffEdit } from '@axe/domain/data/resource-edit-helpers';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BuffManagerPanelComponent } from '@axe/features/buff/buff-manager-panel/buff-manager-panel.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
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

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(BuffManagerPanelComponent));
  });

  it('leaves out the pieces carrying nothing', () => {
    const plain = makeCharacter('素のコマ');
    const buffed = makeCharacter('バフ持ち');
    buffed.buffs.addRound('猛攻撃', '命中+2', 3);
    onTable([plain, buffed]);

    expect(component.rows().map((row) => row.characterName)).toEqual(['バフ持ち']);
    expect(component.rows()[0].bars.map((bar) => bar.name)).toEqual(['猛攻撃']);
  });

  it('gives no row to a piece on the table this reader cannot see', () => {
    const hero = makeCharacter('勇者');
    hero.buffs.addRound('加護', '', 3);
    const lurker = makeCharacter('闇の魔物');
    lurker.buffs.addRound('潜伏', '', 3);
    onTable([hero, lurker]);
    vi.spyOn(TestBed.inject(VisionService), 'mayBeListed').mockImplementation((character) => character !== lurker);

    expect(component.rows().map((row) => row.characterName)).toEqual(['勇者']);
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

  describe('the moment the picked buff moves its effect at', () => {
    function healing(): GameCharacter {
      const buffed = makeCharacter('バフ持ち');
      buffed.status.setValue('HP', 'now', 10);
      applyBuffEdit({ command: '&!再生/:HP/+/0~+3/none', object: buffed, targeted: false }, buffed);
      return buffed;
    }

    const select = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
        '[data-testid="buff-selected-effect-timing"]'
      );

    it('is offered for a buff that moves at every count, standing on what it does without one', async () => {
      onTable([healing()]);
      component.select(component.rows()[0].bars[0]);
      fixture.detectChanges();
      await fixture.whenStable();

      const control = select()!;
      expect(control.options[control.selectedIndex]?.textContent?.trim()).toBe('ラウンド終了時（既定）');
    });

    it('is not offered for a buff that moves nothing at every count', async () => {
      const buffed = makeCharacter('バフ持ち');
      buffed.buffs.addRound('猛攻撃', '命中+2', 3);
      onTable([buffed]);
      component.select(component.rows()[0].bars[0]);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(select()).toBeNull();
    });

    it('is written on the buff, shown as chosen, and taken away again', async () => {
      const buffed = healing();
      onTable([buffed]);
      component.select(component.rows()[0].bars[0]);

      component.setEffectTiming('turnStart');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(buffEffectTimingOf(buffed.buffs.find('再生')!)).toBe('turnStart');
      expect(component.rows()[0].bars[0].effectTiming).toBe('turnStart');
      expect(select()!.options[select()!.selectedIndex]?.textContent?.trim()).toBe('本人の手番開始時');

      component.setEffectTiming('');
      expect(buffEffectTimingOf(buffed.buffs.find('再生')!)).toBeNull();
    });
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

    it('writes a division in the amount so that the command still reads as the preview does', () => {
      component.builderName.set('鼓舞');
      component.builderStatus.set('攻撃');
      component.builderOperator.set('+');
      component.builderAmount.set('(3+4)/2');
      component.builderRounds.set('1');

      expect(component.builderPreview()).toBe('攻撃+3');
      expect(component.builderCommand()).toBe('&!鼓舞/攻撃/+/(3+4)÷2/1');
    });

    it('writes the moment chosen for the effect last, behind tick:, where a status moves at every count', () => {
      component.builderName.set('再生');
      component.builderStatus.set('HP');
      component.builderKeeps.set(true);
      component.builderOperator.set('+');
      component.builderAmount.set('0');
      component.builderStep.set('+3');
      component.builderRounds.set('3');
      component.builderTiming.set('none');
      component.builderEffectTiming.set('turnStart');

      expect(component.builderCommand()).toBe('&!再生/:HP/+/0~+3/3/none/tick:turnStart');

      component.builderTiming.set('turnStart');
      component.builderTrigger.set('術者');
      component.builderEffectTiming.set('turnEnd');
      expect(component.builderCommand()).toBe('&!再生/:HP/+/0~+3/3/turnStart/術者/tick:turnEnd');
    });

    it('lays the buff the builder wrote with the moment it chose', () => {
      component.builderName.set('再生');
      component.builderStatus.set('HP');
      component.builderKeeps.set(true);
      component.builderAmount.set('0');
      component.builderStep.set('+3');
      component.builderTiming.set('turnStart');
      component.builderTrigger.set('術者');
      component.builderEffectTiming.set('turnEnd');
      const piece = makeCharacter('受け手');

      applyBuffEdit({ command: component.builderCommand(), object: piece, targeted: false }, piece);

      const laid = piece.buffs.find('再生')!;
      expect(buffEffectTimingOf(laid)).toBe('turnEnd');
      expect(buffTimingOf(laid)).toBe('turnStart');
      expect(buffTriggerOf(laid)).toBe('術者');
    });

    it('leaves the moment out, and its choice closed, where nothing moves at every count', async () => {
      component.builderStep.set('');
      component.builderEffectTiming.set('turnStart');
      fixture.detectChanges();
      await fixture.whenStable();
      const control = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
        '[data-testid="buff-builder-effect-timing"]'
      );

      expect(component.builderCommand()).not.toContain('tick:');
      expect(control?.disabled).toBe(true);

      component.builderStep.set('-1');
      component.builderOperator.set('=');
      expect(component.builderCommand()).not.toContain('tick:');
    });

    it('says nothing about an effect it cannot read', () => {
      component.builderAmount.set('たくさん');

      expect(component.builderPreview()).toBe('');
    });

    it('writes how far the status moves again at every count, where it is asked for', () => {
      component.builderName.set('変身');
      component.builderStatus.set('器用度');
      component.builderOperator.set('+');
      component.builderAmount.set('5');
      component.builderStep.set('-1');
      component.builderRounds.set('5');

      expect(component.builderCommand()).toBe('&!変身/器用度/+/5~-1/5');
      expect(component.builderPreview()).toBe('器用度+5~-1');

      component.builderOperator.set('=');
      expect(component.builderCommand()).toBe('&!変身/器用度/=/5/5');
    });

    it('marks a status to stay moved once the buff goes with a colon, a row apiece', () => {
      component.builderName.set('毒');
      component.builderStatus.set('HP');
      component.builderOperator.set('+');
      component.builderAmount.set('0');
      component.builderStep.set('-3');
      component.builderRounds.set('3');
      component.builderKeeps.set(true);

      expect(component.builderCommand()).toBe('&!毒/:HP/+/0~-3/3');
      expect(component.builderPreview()).toBe(':HP+0~-3');

      component.builderKeeps.set(false);
      component.builderStatus.set('回避');
      component.builderOperator.set('-');
      component.builderAmount.set('2');
      component.builderStep.set('');
      component.addBuilderStatus();
      component.updateBuilderStatus(0, { status: 'HP', operator: '+', amount: '0', step: '-3', keeps: true });

      expect(component.builderCommand()).toBe('&!毒/回避-2,:HP+0~-3/3');
    });

    it('writes several statuses together once more than one is asked for', () => {
      component.builderName.set('全力攻撃');
      component.builderStatus.set('追D');
      component.builderOperator.set('+');
      component.builderAmount.set('4');
      component.builderRounds.set('1');
      component.addBuilderStatus();
      component.updateBuilderStatus(0, { status: '回避', operator: '-', amount: '2' });

      expect(component.builderCommand()).toBe('&!全力攻撃/追D+4,回避-2/1');
      expect(component.builderPreview()).toBe('追D+4,回避-2');

      component.removeBuilderStatus(0);
      expect(component.builderCommand()).toBe('&!全力攻撃/追D/+/4/1');
    });

    it('lays a buff holding any of its statuses at a value anew, rather than stacking it', () => {
      component.builderStacks.set(true);
      component.addBuilderStatus();
      component.updateBuilderStatus(0, { status: '防護点', operator: '=', amount: '10', step: '1' });

      expect(component.builderCanStack()).toBe(false);
      expect(component.builderCommand()).toMatch(/^&!.*防護点=10\//);
    });

    it('marks the command for a second helping when one is asked for', () => {
      component.builderName.set('猛攻撃');
      component.builderStatus.set('命中');
      component.builderOperator.set('+');
      component.builderAmount.set('2');
      component.builderRounds.set('3');
      component.builderStacks.set(true);

      expect(component.builderCommand()).toBe('&+!猛攻撃/命中/+/2/3');
    });

    it('writes two marks when the helping lengthens the buff as well', () => {
      component.builderName.set('猛攻撃');
      component.builderStatus.set('命中');
      component.builderOperator.set('+');
      component.builderAmount.set('2');
      component.builderRounds.set('3');
      component.builderStacks.set(true);
      component.builderExtends.set(true);

      expect(component.builderCommand()).toBe('&++!猛攻撃/命中/+/2/3');
    });

    it('offers no second helping for a buff that only holds a status at a value', () => {
      component.builderOperator.set('=');
      component.builderStacks.set(true);

      expect(component.builderCanStack()).toBe(false);
      expect(component.builderCommand().startsWith('&!')).toBe(true);
    });
  });

  describe('sweeping buffs off the table', () => {
    let knight: GameCharacter;
    let archer: GameCharacter;

    beforeEach(() => {
      PeerCursor.createMyCursor();
      knight = makeCharacter('騎士');
      knight.buffs.addRound('毒', '', 3, { timing: 'none' });
      knight.buffs.addRound('加速', '', 2);
      archer = makeCharacter('弓兵');
      archer.buffs.addRound('毒', '', 2);
      onTable([knight, archer]);
    });

    afterEach(() => {
      PeerCursor.myCursor = null!;
    });

    function beRole(role: PeerRole): void {
      PeerCursor.myCursor.role = role;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    }

    function names(piece: GameCharacter): string[] {
      return (piece.buffDataElement?.children[0]?.children ?? []).map((data) => data.name);
    }

    it('is offered to the game master alone', () => {
      beRole(PeerRole.Player);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="buff-sweep"]')).toBeNull();

      beRole(PeerRole.GameMaster);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="buff-sweep"]')).not.toBeNull();
    });

    it('counts what each kind of sweep would reach', () => {
      beRole(PeerRole.GameMaster);
      expect(component.sweepCount()).toEqual({ characters: 1, buffs: 1 });

      component.sweepKind.set('rounds');
      component.sweepRounds.set(2);
      expect(component.sweepCount()).toEqual({ characters: 2, buffs: 2 });

      component.sweepKind.set('name');
      expect(component.sweepNames()).toEqual(['毒', '加速']);
      expect(component.sweepCount()).toEqual({ characters: 2, buffs: 2 });
    });

    it('takes the chosen buffs off every piece once confirmed, and says so in chat', async () => {
      beRole(PeerRole.GameMaster);
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
      const said = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(undefined as never);
      component.sweepKind.set('name');
      component.sweepName.set('毒');

      await component.sweep();

      expect(names(knight)).toEqual(['加速']);
      expect(names(archer)).toEqual([]);
      expect(said).toHaveBeenCalledOnce();
      expect(said.mock.calls[0][0]).toBe('round');
    });

    describe('the three further choices and the values (acceptance 20)', () => {
      let hit: DataElement;
      let told: ResetCarriedOutEvent[];
      let stop: () => void;

      const radio = (kind: string) =>
        (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`[data-testid="buff-sweep-${kind}"]`);
      const countLine = () =>
        (fixture.nativeElement as HTMLElement).querySelector('[data-testid="buff-sweep-count"]')!.textContent!.trim();
      const run = () =>
        (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="buff-sweep-run"]')!;
      const t = () => TestBed.inject(TRANSLATE_FN);

      beforeEach(() => {
        archer.buffs.addRound('呪い', '命中-1', 2, { kind: 'debuff' });
        hit = DataElement.create('命中', 9, { fieldType: 'number', 'cs-default': '3' });
        knight.detailDataElement!.children[0].appendChild(hit);
        told = [];
        stop = resetCarriedOut$.subscribe((event) => told.push(event));
      });

      afterEach(() => stop());

      it('offers six choices to the game master, the three that were there first, and a box for the values', () => {
        beRole(PeerRole.GameMaster);
        fixture.detectChanges();
        const kinds = [...(fixture.nativeElement as HTMLElement).querySelectorAll('input[name="sweepKind"]')].map(
          (input) => (input as HTMLInputElement).value
        );

        expect(kinds).toEqual(['held', 'rounds', 'name', 'all', 'buffs', 'debuffs']);
        expect(radio('held')!.checked).toBe(true);
        expect(
          (fixture.nativeElement as HTMLElement).querySelector('[data-testid="buff-sweep-with-values"]')
        ).not.toBeNull();
      });

      it('offers none of it to anyone but the game master', () => {
        beRole(PeerRole.Player);
        fixture.detectChanges();

        expect(radio('all')).toBeNull();
        expect(
          (fixture.nativeElement as HTMLElement).querySelector('[data-testid="buff-sweep-with-values"]')
        ).toBeNull();
      });

      it('counts what each of the new choices would reach', () => {
        beRole(PeerRole.GameMaster);

        component.sweepKind.set('all');
        expect(component.sweepCount()).toEqual({ characters: 2, buffs: 4 });
        component.sweepKind.set('buffs');
        expect(component.sweepCount()).toEqual({ characters: 2, buffs: 3 });
        component.sweepKind.set('debuffs');
        expect(component.sweepCount()).toEqual({ characters: 1, buffs: 1 });
      });

      it('tells a debuff by the states the room keeps as well as by its mark', () => {
        beRole(PeerRole.GameMaster);
        component.sweepKind.set('debuffs');
        TestBed.inject(StatusAilmentService).save([newStatusAilment('毒')]);
        try {
          expect(component.sweepCount()).toEqual({ characters: 2, buffs: 3 });
        } finally {
          TestBed.inject(StatusAilmentService).save([]);
          StatusAilmentCatalog.forget();
        }
      });

      it('counts the values as well once the box is ticked, and lets a sweep with only values to put back run', () => {
        beRole(PeerRole.GameMaster);
        component.sweepKind.set('all');
        component.sweepWithValues.set(true);
        fixture.detectChanges();

        expect(component.sweepReach()).toEqual({ characters: 2, buffs: 4, items: 1 });
        expect(countLine()).toBe(
          t()('feature.buffManager.sweepCountWithValues', { characters: 2, buffs: 4, items: 1 })
        );

        component.sweepKind.set('rounds');
        component.sweepRounds.set(9);
        fixture.detectChanges();
        expect(component.sweepCount().buffs).toBe(0);
        expect(component.canSweep()).toBe(true);
        expect(run().disabled).toBe(false);

        component.sweepWithValues.set(false);
        fixture.detectChanges();
        expect(run().disabled).toBe(true);
      });

      it('clears every buff once confirmed, reports it, and keeps the way back under the report', async () => {
        beRole(PeerRole.GameMaster);
        const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
        const line = { identifier: 'report-line' } as ChatMessage;
        const said = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(line);
        component.sweepKind.set('all');

        await component.sweep();

        expect(ask).toHaveBeenCalledExactlyOnceWith(
          t()('feature.buffManager.sweepConfirm', {
            what: t()('feature.buffManager.sweepAllWhat'),
            characters: 2,
            buffs: 4,
          })
        );
        expect([names(knight), names(archer), hit.value]).toEqual([[], [], 9]);
        expect(said).toHaveBeenCalledExactlyOnceWith(
          'round',
          encodeI18nMessage('feature.buffManager.sweepDone', {
            what: encodeI18nMessage('feature.buffManager.sweepAllWhat', {}),
            characters: 2,
            buffs: 4,
            items: 0,
          })
        );
        expect(told.map((event) => event.messageIdentifier)).toEqual(['report-line']);
      });

      it.each<['buffs' | 'debuffs', string[], string[]]>([
        ['buffs', [], ['呪い']],
        ['debuffs', ['毒', '加速'], ['毒']],
      ])('takes the %s alone', async (kind, onKnight, onArcher) => {
        beRole(PeerRole.GameMaster);
        vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
        vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(null);
        component.sweepKind.set(kind);

        await component.sweep();

        expect([names(knight), names(archer)]).toEqual([onKnight, onArcher]);
      });

      it('puts the values back as well where the box is ticked, with any choice, and says both', async () => {
        beRole(PeerRole.GameMaster);
        const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
        const said = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(null);
        component.sweepKind.set('name');
        component.sweepName.set('毒');
        component.sweepWithValues.set(true);

        await component.sweep();

        expect(ask.mock.calls[0][0]).toBe(
          t()('feature.buffManager.sweepConfirmWithValues', {
            what: t()('feature.buffManager.sweepNameWhat', { name: '毒' }),
            characters: 2,
            buffs: 2,
            items: 1,
          })
        );
        expect([names(knight), names(archer), hit.value]).toEqual([['加速'], ['呪い'], 3]);
        expect(said.mock.calls[0][1]).toBe(
          encodeI18nMessage('feature.buffManager.resetDone', {
            what: encodeI18nMessage('feature.buffManager.sweepNameWhat', { name: '毒' }),
            characters: 2,
            buffs: 2,
            items: 1,
          })
        );
      });

      it.each<[BuffRemovalRule['kind'], string, Record<string, unknown>, string[], number, number]>([
        ['held', 'feature.buffManager.sweepHeldWhat', {}, ['加速'], 1, 1],
        ['rounds', 'feature.buffManager.sweepRoundsWhat', { n: 2 }, ['毒'], 2, 3],
        ['name', 'feature.buffManager.sweepNameWhat', { name: '毒' }, ['加速'], 2, 2],
      ])(
        'keeps a way back for a sweep by a condition without the values (%s)',
        async (kind, whatKey, whatParams, left, characters, buffs) => {
          beRole(PeerRole.GameMaster);
          vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
          const said = vi
            .spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice')
            .mockReturnValue({ identifier: 'report-line' } as ChatMessage);
          component.sweepKind.set(kind);
          component.sweepRounds.set(2);
          component.sweepName.set('毒');

          await component.sweep();

          expect(names(knight)).toEqual(left);
          expect(said.mock.calls[0][1]).toBe(
            encodeI18nMessage('feature.buffManager.sweepDone', {
              what: encodeI18nMessage(whatKey, whatParams),
              characters,
              buffs,
              items: 0,
            })
          );
          expect(told.map((event) => event.messageIdentifier)).toEqual(['report-line']);
          undoReset(told[0].record as ResetRecord);
          expect(names(knight)).toEqual(['毒', '加速']);
        }
      );

      it('leaves the buff a piece rides two up by, and does not count it, whatever the sweep picks by', async () => {
        beRole(PeerRole.GameMaster);
        vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
        vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(null);
        const given = knight.buffs.find('毒')!;
        knight.rideTwoUpFrom = 'mount';
        knight.rideTwoUpBuff = given.identifier;
        TestBed.inject(ObjectChangeService).notifyChanged(knight.identifier);

        component.sweepKind.set('held');
        expect(component.sweepCount()).toEqual({ characters: 0, buffs: 0 });
        expect(component.canSweep()).toBe(false);

        component.sweepKind.set('name');
        component.sweepName.set('毒');
        expect(component.sweepCount()).toEqual({ characters: 1, buffs: 1 });
        await component.sweep();

        expect([names(knight), names(archer)]).toEqual([['毒', '加速'], ['呪い']]);
      });

      it('does nothing with the new choices for anyone but the game master, or where it is called off', async () => {
        const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
        component.sweepKind.set('all');
        component.sweepWithValues.set(true);

        beRole(PeerRole.Player);
        await component.sweep();
        expect(ask).not.toHaveBeenCalled();

        beRole(PeerRole.GameMaster);
        ask.mockResolvedValue(false);
        await component.sweep();

        expect([names(knight), hit.value]).toEqual([['毒', '加速'], 9]);
        expect(told).toEqual([]);
      });
    });

    describe('marking a buff a buff or a debuff', () => {
      it('shows the picked buff’s kind in its details and writes the mark as it is changed', () => {
        beRole(PeerRole.GameMaster);
        const poison = knight.buffs.find('毒')!;
        component.selected.set(poison.identifier);
        fixture.detectChanges();
        const select = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="buff-selected-kind"]');

        expect(select?.querySelectorAll('option')).toHaveLength(2);
        expect(component.selectedKind()).toBe('buff');

        component.setKind('debuff');

        expect(poison.getAttribute('cs-buff-kind')).toBe('debuff');
        expect(component.selectedKind()).toBe('debuff');
      });

      it('writes the word for a debuff into the command it builds, where a plain look reads it, and none for a buff', () => {
        expect(component.builderCommand()).toBe('&!猛攻撃/命中/+/2/3');

        component.builderKindPicked.set('buff');
        expect(component.builderCommand()).toBe('&!猛攻撃/命中/+/2/3');

        component.builderKindPicked.set('debuff');
        expect(component.builderCommand()).toBe('&!猛攻撃/命中/+/2/3/debuff');

        component.builderTiming.set('turnStart');
        component.builderTrigger.set('術者');
        expect(component.builderCommand()).toBe('&!猛攻撃/命中/+/2/3/turnStart/術者/debuff');
      });

      describe('for a name that is a state the room keeps', () => {
        beforeEach(() => {
          TestBed.inject(StatusAilmentService).save([newStatusAilment('麻痺')]);
          component.builderName.set('麻痺');
        });

        afterEach(() => {
          TestBed.inject(StatusAilmentService).save([]);
          StatusAilmentCatalog.forget();
        });

        it('shows a debuff and writes no word while the choice is left as it came', () => {
          expect(component.builderKind()).toBe('debuff');
          expect(component.builderCommand()).toBe('&!麻痺/命中/+/2/3');
        });

        it('writes the word for a buff once a buff is picked by hand, and the command lays a buff', () => {
          component.builderKindPicked.set('buff');

          expect(component.builderKind()).toBe('buff');
          expect(component.builderCommand()).toBe('&!麻痺/命中/+/2/3/buff');
          applyBuffEdit({ command: component.builderCommand(), object: knight, targeted: false }, knight);
          const laid = knight.buffs.find('麻痺')!;
          expect(laid.getAttribute('cs-buff-kind')).toBe('buff');
          expect(buffKindOf(laid, TestBed.inject(StatusAilmentService).ailments())).toBe('buff');
        });
      });

      it.each(['&!呪い/回避/-/1/3/debuff', '&!呪い/回避/-/1/3/turnStart/術者/debuff', '&!呪い/回避/-/1/3/none/debuff'])(
        'lays a debuff with the command built as %s',
        (command) => {
          applyBuffEdit({ command, object: knight, targeted: false }, knight);

          expect(knight.buffs.find('呪い')?.getAttribute('cs-buff-kind')).toBe('debuff');
        }
      );
    });

    it('takes nothing when the game master thinks better of it, or for anyone else', async () => {
      const asked = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
      beRole(PeerRole.GameMaster);
      await component.sweep();
      expect(names(knight)).toEqual(['毒', '加速']);

      asked.mockResolvedValue(true);
      beRole(PeerRole.Player);
      await component.sweep();
      expect(names(knight)).toEqual(['毒', '加速']);
    });
  });
});
