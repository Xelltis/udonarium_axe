import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameDataElementBuffComponent } from '@axe/features/character/game-data-element-buff/game-data-element-buff.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';

describe('GameDataElementBuffComponent', () => {
  let component: GameDataElementBuffComponent;
  let fixture: ComponentFixture<GameDataElementBuffComponent>;
  let buff: DataElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameDataElementBuffComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GameDataElementBuffComponent);
    component = fixture.componentInstance;
    buff = DataElement.create('毒', '', {});
    fixture.componentRef.setInput('gameDataElement', buff);
  });

  afterEach(() => {
    buff.destroy();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('follows the element where it is changed from elsewhere', () => {
    fixture.detectChanges();
    expect(component.name).toBe('毒');

    buff.name = '猛毒';
    TestBed.inject(ObjectChangeService).notifyChanged(buff.identifier);
    fixture.detectChanges();

    expect(component.name).toBe('猛毒');
  });

  it('keeps what is being typed while it waits to be written, though the element changes meanwhile', () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      component.name = '麻痺';
      component.currentValue = '敏捷-2';

      buff.setAttribute(DataElementAttribute.BUFF_COLOR, '#2e7d32');
      TestBed.inject(ObjectChangeService).notifyChanged(buff.identifier);
      fixture.detectChanges();

      expect(component.name).toBe('麻痺');
      expect(component.currentValue).toBe('敏捷-2');

      vi.advanceTimersByTime(66);
      expect(buff.name).toBe('麻痺');
      expect(buff.currentValue).toBe('敏捷-2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws a picture chosen as the mark on the piece, rather than writing out its name', () => {
    const row = DataElement.create('毒', '-2', { type: 'numberResource', currentValue: '-2' });
    row.value = 3;
    row.setAttribute(DataElementAttribute.BUFF_ICON, '452c31a22f');
    vi.spyOn(ImageStorage.instance, 'get').mockImplementation(
      (identifier) => (identifier === '452c31a22f' ? { url: 'blob:poison' } : null) as never
    );
    fixture.componentRef.setInput('gameDataElement', row);
    fixture.componentRef.setInput('isPieceMode', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-testid="buff-row-mark"] img')?.getAttribute('src')).toBe('blob:poison');
    expect(root.textContent).not.toContain('452c31a22f');
    row.destroy();
  });

  it('writes a mark that names no picture as it is on the piece', () => {
    const row = DataElement.create('毒', '-2', { type: 'numberResource', currentValue: '-2' });
    row.setAttribute(DataElementAttribute.BUFF_ICON, '☠️');
    fixture.componentRef.setInput('gameDataElement', row);
    fixture.componentRef.setInput('isPieceMode', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-testid="buff-row-mark"] img')).toBeNull();
    expect(root.textContent).toContain('☠️');
    row.destroy();
  });

  it('paints the mark on the piece in the colour the buff was given, as its badge is', () => {
    const row = DataElement.create('石化', 1, { type: 'numberResource', currentValue: 'HP=0' });
    row.setAttribute(DataElementAttribute.BUFF_COLOR, '#2e7d32');
    fixture.componentRef.setInput('gameDataElement', row);
    fixture.componentRef.setInput('isPieceMode', true);
    fixture.detectChanges();
    const mark = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="buff-row-mark"] [data-testid="buff-badge-mark"]'
    );

    expect(mark?.style.background).toBe('#2e7d32');
    row.destroy();
  });

  for (const { timing, shown } of [
    { timing: 'none', shown: '毒 / 継続2 / ∞R' },
    { timing: 'roundEnd', shown: '毒 / 継続2 / 3R' },
  ]) {
    it(`shows the rounds left on the piece, and ∞ for a buff that never runs out (${timing})`, () => {
      const row = DataElement.create('毒', 3, { type: 'numberResource', currentValue: '継続2' });
      row.setAttribute(DataElementAttribute.BUFF_TIMING, timing);
      fixture.componentRef.setInput('gameDataElement', row);
      fixture.componentRef.setInput('isPieceMode', true);
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="buff-row-text"]');

      expect(text?.textContent?.trim()).toBe(shown);
      row.destroy();
    });
  }

  it('shows the timing and the trigger the buff holds in their dropdowns', async () => {
    const row = DataElement.create('猛攻撃', 3, { type: 'numberResource', currentValue: '筋力+2' });
    row.setAttribute(DataElementAttribute.BUFF_TIMING, 'turnStart');
    fixture.componentRef.setInput('gameDataElement', row);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const shown = (testId: string) => {
      const select = root.querySelector<HTMLSelectElement>(`[data-testid="${testId}"]`)!;
      return select.options[select.selectedIndex]?.textContent?.trim();
    };

    expect(shown('buff-row-timing')).toBe('トリガーの手番開始時');
    expect(shown('buff-row-trigger')).toBe('未指定なら本人');
    row.destroy();
  });

  describe('the moment the effect moves at', () => {
    /** A buff that heals 3 at every count and leaves it healed, as `&!再生/:HP/+/0~+3` lays it. */
    function stepping(timing: string): DataElement {
      const row = DataElement.create('再生', 3, { type: 'numberResource', currentValue: ':HP+0~+3' });
      row.setAttribute(DataElementAttribute.BUFF_TIMING, timing);
      row.setAttribute(DataElementAttribute.BUFF_MOD_TARGET, 'HP');
      row.setAttribute(DataElementAttribute.BUFF_MOD_APPLIED, '0');
      row.setAttribute(DataElementAttribute.BUFF_MOD_KEPT, '0');
      row.setAttribute(DataElementAttribute.BUFF_MOD_KEPT_STEP, '3');
      return row;
    }

    const select = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('[data-testid="buff-row-effect-timing"]');
    const shown = () => select()!.options[select()!.selectedIndex]?.textContent?.trim();

    it('is not offered for a buff that moves nothing at every count', async () => {
      const row = DataElement.create('猛攻撃', 3, { type: 'numberResource', currentValue: '筋力+2' });
      fixture.componentRef.setInput('gameDataElement', row);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(select()).toBeNull();
      row.destroy();
    });

    it('stands on the count for a buff with rounds that has none of its own', async () => {
      const row = stepping('roundEnd');
      fixture.componentRef.setInput('gameDataElement', row);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(shown()).toBe('残ラウンドが減るとき');
      row.destroy();
    });

    it('stands on the end of the round for a buff that never runs out and has none of its own', async () => {
      const row = stepping('none');
      fixture.componentRef.setInput('gameDataElement', row);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(shown()).toBe('ラウンド終了時（既定）');
      row.destroy();
    });

    it('shows the moment the buff carries, and writes the one chosen', async () => {
      const row = stepping('none');
      row.setAttribute(DataElementAttribute.BUFF_EFFECT_TIMING, 'turnStart');
      fixture.componentRef.setInput('gameDataElement', row);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(shown()).toBe('本人の手番開始時');

      const control = select()!;
      control.selectedIndex = [...control.options].findIndex(
        (option) => option.textContent?.trim() === '本人の手番終了時'
      );
      control.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(row.getAttribute(DataElementAttribute.BUFF_EFFECT_TIMING)).toBe('turnEnd');
      expect(shown()).toBe('本人の手番終了時');
      row.destroy();
    });

    it('takes the moment away where the first choice is made, and keeps the row to choose from', async () => {
      const row = DataElement.create('再生', 3, { type: 'numberResource', currentValue: '回復' });
      row.setAttribute(DataElementAttribute.BUFF_EFFECT_TIMING, 'turnEnd');
      fixture.componentRef.setInput('gameDataElement', row);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(shown()).toBe('本人の手番終了時');

      component.selectEffectTiming('');

      expect(DataElementAttribute.BUFF_EFFECT_TIMING in row.toAttributes()).toBe(false);
      row.destroy();
    });

    it('is marked beside the rounds on the piece where the buff has one of its own, and not otherwise', () => {
      const row = stepping('none');
      fixture.componentRef.setInput('gameDataElement', row);
      fixture.componentRef.setInput('isPieceMode', true);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const mark = () => root.querySelector('[data-testid="buff-row-effect-timing-mark"]');
      expect(mark()).toBeNull();
      expect(root.querySelector('[data-testid="buff-row-text"]')?.textContent?.trim()).toBe('再生 / :HP+0~+3 / ∞R');

      row.setAttribute(DataElementAttribute.BUFF_EFFECT_TIMING, 'turnEnd');
      TestBed.inject(ObjectChangeService).notifyChanged(row.identifier);
      fixture.detectChanges();

      expect(mark()?.textContent?.trim()).toBe('発生:手番終了');
      row.destroy();
    });
  });

  it('fetches the picture selector and puts the picture chosen in place of the mark', async () => {
    const open = vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue('poison-picture');

    await component.chooseIconImage();

    expect(open.mock.calls[0][0]).toBe(FileSelecterComponent);
    expect(buff.getAttribute(DataElementAttribute.BUFF_ICON)).toBe('poison-picture');
  });

  it('takes the picture away where the empty choice is made, and leaves it where nothing is', async () => {
    buff.setAttribute(DataElementAttribute.BUFF_ICON, 'old-picture');
    const open = vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue(null);

    await component.chooseIconImage();
    expect(buff.getAttribute(DataElementAttribute.BUFF_ICON)).toBe('old-picture');

    open.mockResolvedValue('');
    await component.chooseIconImage();
    expect(buff.getAttribute(DataElementAttribute.BUFF_ICON)).toBe('');
  });

  describe('whether the buff is a buff or a debuff', () => {
    const originalCursor = PeerCursor.myCursor;
    let container: DataElement;

    function row(name: string, attributes: Record<string, string> = {}): DataElement {
      const made = DataElement.create(name, 3, { type: 'numberResource', currentValue: '命中-1', ...attributes });
      container.appendChild(made);
      return made;
    }

    function show(element: DataElement): HTMLSelectElement {
      fixture.componentRef.setInput('gameDataElement', element);
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('[data-testid="buff-row-kind"]')!;
    }

    beforeEach(() => {
      PeerCursor.myCursor = { role: PeerRole.Player, userId: 'me', identifier: 'seat' } as PeerCursor;
      container = DataElement.create('バフ/デバフ', '');
      TestBed.inject(StatusAilmentService).save([newStatusAilment('毒')]);
    });

    afterEach(() => {
      PeerCursor.myCursor = originalCursor;
      container.destroy();
      TestBed.inject(StatusAilmentService).save([]);
      StatusAilmentCatalog.forget();
    });

    it('offers the choice on the row of the sheet, standing at a buff for a buff with no mark', () => {
      const select = show(row('猛攻撃'));

      expect(select.querySelectorAll('option')).toHaveLength(2);
      expect(component.kind()).toBe('buff');
    });

    it('shows a state the room keeps as a debuff without anyone setting it', () => {
      show(row('毒'));

      expect(component.kind()).toBe('debuff');
    });

    it('writes the mark as it is chosen, either way', () => {
      const poison = row('毒');
      show(poison);

      component.selectKind('buff');
      expect(poison.getAttribute(DataElementAttribute.BUFF_KIND)).toBe('buff');
      expect(component.kind()).toBe('buff');

      component.selectKind('debuff');
      expect(poison.getAttribute(DataElementAttribute.BUFF_KIND)).toBe('debuff');
      expect(component.kind()).toBe('debuff');
    });

    it('shows a further row of a buff as its first row is, and marks the first row from it', () => {
      const head = row('祝福', { [DataElementAttribute.BUFF_GROUP]: '祝福' });
      const member = row('祝福（回避）', { [DataElementAttribute.BUFF_GROUP]: '祝福' });
      show(member);

      component.selectKind('debuff');

      expect(head.getAttribute(DataElementAttribute.BUFF_KIND)).toBe('debuff');
      expect(component.kind()).toBe('debuff');
    });

    it('writes nothing for a seat that only watches', () => {
      const blessing = row('祝福');
      show(blessing);
      PeerCursor.myCursor = { role: PeerRole.Guest, userId: 'me', identifier: 'seat' } as PeerCursor;
      TestBed.inject(ObjectChangeService).notifyChanged('seat');

      component.selectKind('debuff');

      expect(blessing.toAttributes()).not.toHaveProperty(DataElementAttribute.BUFF_KIND);
    });

    it('names the choice for a screen reader and marks it with a sign in front, as the timing beside it is', () => {
      const select = show(row('盾'));

      expect(select.getAttribute('aria-label')).toBe(select.title);
      expect(select.getAttribute('aria-label')!.length).toBeGreaterThan(0);
      const cue = select.previousElementSibling as HTMLElement;
      expect(cue.dataset['testid']).toBe('buff-row-kind-cue');
      expect([cue.getAttribute('aria-hidden'), cue.classList.contains('material-icons')]).toEqual(['true', true]);
      expect(cue.parentElement).toBe(
        (fixture.nativeElement as HTMLElement).querySelector('[data-testid="buff-row-timing"]')!.parentElement
      );
    });

    it('shows the ▼ of a debuff on the badge of the row drawn over the piece, and no choice there', () => {
      fixture.componentRef.setInput('isPieceMode', true);
      fixture.componentRef.setInput('gameDataElement', row('毒'));
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="buff-debuff-mark"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="buff-row-kind"]')).toBeNull();
    });
  });
});
