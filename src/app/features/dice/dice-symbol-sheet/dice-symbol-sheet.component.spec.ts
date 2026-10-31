import { TestBed } from '@angular/core/testing';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Network } from '@axe/core/network/network';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { DiceSymbolSheetComponent } from '@axe/features/dice/dice-symbol-sheet/dice-symbol-sheet.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DiceSymbolSheetComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DiceSymbolSheetComponent], providers: [...TEST_PROVIDERS] });
  });

  it('saves nothing of a die whose face a room server keeps from this seat', async () => {
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(DiceSymbol.prototype, 'isVisible', 'get').mockReturnValue(false);
    const save = vi.spyOn(TestBed.inject(SaveDataService), 'saveGameObjectAsync').mockResolvedValue();
    const component = TestBed.createComponent(DiceSymbolSheetComponent).componentInstance;
    component.diceSymbol = DiceSymbol.create('ほかの人のダイス', DiceType.D6, 1);

    const shown = vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => {});
    await component.saveToXML();

    expect(save).not.toHaveBeenCalled();
    expect(shown).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('copies nothing of a die whose face a room server keeps from this seat, and says so', () => {
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
    vi.spyOn(DiceSymbol.prototype, 'isVisible', 'get').mockReturnValue(false);
    const component = TestBed.createComponent(DiceSymbolSheetComponent).componentInstance;
    const die = DiceSymbol.create('ほかの人のダイス', DiceType.D6, 1);
    const cloned = vi.spyOn(die, 'clone');
    component.diceSymbol = die;

    const shown = vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => {});
    component.clone();

    expect(cloned).not.toHaveBeenCalled();
    expect(shown).toHaveBeenCalledTimes(1);
    die.destroy();
    vi.restoreAllMocks();
  });

  describe('the description', () => {
    let die: DiceSymbol;

    beforeEach(() => {
      die = DiceSymbol.create('説明つきのダイス', DiceType.D6, 1);
    });

    afterEach(() => die.destroy());

    function sheetOf(target: DiceSymbol): DiceSymbolSheetComponent {
      const component = TestBed.createComponent(DiceSymbolSheetComponent).componentInstance;
      component.diceSymbol = target;
      return component;
    }

    it('is written into a note of the die, which the popup shows as one', () => {
      sheetOf(die).writeDescription('触れると燃える');

      const [item] = die.detailDataElement!.children;
      expect(item.isNote).toBe(true);
      expect(item.value).toBe('触れると燃える');
      expect(die.detailDataElement!.children).toHaveLength(1);
    });

    it('is read from and written back into the note a die brought from elsewhere already holds', () => {
      const section = DataElement.create('情報', '', {});
      const note = DataElement.create('説明', '前からある説明', { type: 'note' });
      section.appendChild(note);
      die.detailDataElement!.appendChild(section);
      const sheet = sheetOf(die);

      expect(sheet.description()).toBe('前からある説明');
      sheet.writeDescription('書き直した説明');

      expect(note.value).toBe('書き直した説明');
      expect(die.detailDataElement!.children).toHaveLength(1);
    });

    it('writes over no note of a die that holds several, none of them named as its description', () => {
      const memo = DataElement.create('メモ', 'GMだけが読む', { type: 'note' });
      const effect = DataElement.create('効果', '1ターン燃える', { type: 'note' });
      die.detailDataElement!.appendChild(memo);
      die.detailDataElement!.appendChild(effect);
      const sheet = sheetOf(die);

      expect(sheet.description()).toBe('');
      sheet.writeDescription('説明');

      expect(memo.value).toBe('GMだけが読む');
      expect(effect.value).toBe('1ターン燃える');
      expect(die.detailDataElement!.children).toHaveLength(3);
    });

    it('shows a description written at another seat', () => {
      const note = DataElement.create('説明', '前の説明', { type: 'note' });
      die.detailDataElement!.appendChild(note);
      const sheet = sheetOf(die);
      expect(sheet.description()).toBe('前の説明');

      note.value = 'ほかの席で書き直した説明';
      TestBed.inject(ObjectChangeService).notifyChanged(note.identifier);

      expect(sheet.description()).toBe('ほかの席で書き直した説明');
    });

    it('adds nothing to a die while it is left empty', () => {
      sheetOf(die).writeDescription('');

      expect(die.detailDataElement!.children).toHaveLength(0);
    });

    it('is typed into a box on the sheet', async () => {
      const fixture = TestBed.createComponent(DiceSymbolSheetComponent);
      fixture.componentInstance.diceSymbol = die;
      await fixture.whenStable();

      const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
        '[data-testid="dice-sheet-description"]'
      )!;
      box.value = '一行目';
      box.dispatchEvent(new Event('input'));
      box.value = '一行目\n二行目';
      box.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      expect(fixture.componentInstance.description()).toBe('一行目\n二行目');
      expect(die.detailDataElement!.children).toHaveLength(1);
    });
  });

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(DiceSymbolSheetComponent));
  });
});
