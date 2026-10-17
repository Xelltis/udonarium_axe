import { TestBed } from '@angular/core/testing';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Network } from '@axe/core/network/network';
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

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(DiceSymbolSheetComponent));
  });
});
