import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { TabletopDisplayPreferenceService } from '@axe/application/ui/tabletop-display-preference.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { createDefaultCutIns, DEFAULT_CUT_IN_SEEDS } from '@axe/domain/media/builtin-cut-ins';
import { CutIn } from '@axe/domain/media/cut-in';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { CutInListComponent } from '@axe/features/media/cut-in-list/cut-in-list.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** The first of the samples a room starts with. */
const SAMPLE = DEFAULT_CUT_IN_SEEDS[0].identifier;

describe('CutInListComponent', () => {
  let component: CutInListComponent;
  let fixture: ComponentFixture<CutInListComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInListComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  let table: GameTable;

  beforeEach(() => {
    table = new GameTable();
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    fixture = TestBed.createComponent(CutInListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => table.destroy());

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('a seat that is only watching', () => {
    function beSeat(role: PeerRole): void {
      PeerCursor.myCursor = { role, identifier: 'seat-cursor' } as PeerCursor;
    }

    it('makes no cut-in', () => {
      beSeat(PeerRole.Guest);

      component.createCutIn();

      expect(component.cutIns()).toHaveLength(0);
    });

    it('throws none away', () => {
      beSeat(PeerRole.Player);
      component.createCutIn();
      const made = component.selectedCutIn()!;
      beSeat(PeerRole.Guest);

      component.delete();

      expect(component.cutIns().map((cutIn) => cutIn.identifier)).toContain(made.identifier);
    });

    it('is handed the editors with nothing to change', () => {
      beSeat(PeerRole.Player);
      component.createCutIn();
      expect(component.isEditable).toBe(true);

      beSeat(PeerRole.Guest);

      expect(component.isEditable).toBe(false);
      expect(component.canEditCutIns).toBe(false);
    });

    async function drawnIcons(): Promise<string[]> {
      fixture.detectChanges();
      await fixture.whenStable();
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll('i.material-icons')].map(
        (icon) => icon.textContent?.trim() ?? ''
      );
    }

    it('draws neither the way in nor the way out', async () => {
      beSeat(PeerRole.Guest);

      const icons = await drawnIcons();

      expect(icons).not.toContain('add');
      expect(icons).not.toContain('delete');
      expect(icons).not.toContain('restore');
    });

    it('draws both for a player', async () => {
      beSeat(PeerRole.Player);
      component.createCutIn();

      const icons = await drawnIcons();

      expect(icons).toContain('add');
      expect(icons).toContain('delete');
      expect(icons).toContain('restore');
    });

    it('brings back no sample for a seat that is only watching', () => {
      createDefaultCutIns(ImageStorage.instance);
      ObjectStore.instance.get<CutIn>(SAMPLE)!.destroy();
      beSeat(PeerRole.Guest);

      component.restoreSamples();

      expect(ObjectStore.instance.get(SAMPLE)).toBeNull();
    });
  });

  describe('putting the samples back', () => {
    const restoreButton = (): HTMLButtonElement =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="cut-in-restore-samples"]'
      )!;

    async function drawn(): Promise<void> {
      fixture.detectChanges();
      await fixture.whenStable();
    }

    beforeEach(() => {
      PeerCursor.myCursor = { role: PeerRole.Player, identifier: 'seat-cursor' } as PeerCursor;
      createDefaultCutIns(ImageStorage.instance);
    });

    afterEach(() => vi.restoreAllMocks());

    it('offers to bring back a sample once it is deleted, and brings it back whole', async () => {
      await drawn();
      expect(restoreButton().disabled).toBe(true);

      component.selectCutIn(SAMPLE);
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
      await component.delete();
      await drawn();
      expect(restoreButton().disabled).toBe(false);

      restoreButton().click();
      await drawn();

      expect(ObjectStore.instance.get<CutIn>(SAMPLE)?.scene?.layers).toHaveLength(
        DEFAULT_CUT_IN_SEEDS[0].layers.length
      );
      expect(restoreButton().disabled).toBe(true);
    });

    it('offers to bring back a layer taken out of a sample', async () => {
      ObjectStore.instance.get(DEFAULT_CUT_IN_SEEDS[0].layers[0].identifier)!.destroy();
      await drawn();

      expect(restoreButton().disabled).toBe(false);
    });
  });

  describe('picking a cut-in from the list', () => {
    let t: (key: string) => string;

    beforeEach(() => {
      PeerCursor.myCursor = { role: PeerRole.Player, identifier: 'seat-cursor' } as PeerCursor;
      t = TestBed.inject(TRANSLATE_FN);
      for (const name of ['登場', '決めゼリフ']) {
        const cutIn = new CutIn();
        cutIn.name = name;
        cutIn.initialize();
      }
    });

    afterEach(() => {
      for (const cutIn of component.cutIns()) cutIn.destroy();
    });

    async function drawn(): Promise<HTMLElement> {
      fixture.detectChanges();
      await fixture.whenStable();
      return fixture.nativeElement as HTMLElement;
    }

    function options(root: HTMLElement): HTMLElement[] {
      return [...root.querySelectorAll<HTMLElement>('li[role="option"]')];
    }

    function hasButton(root: HTMLElement, label: string): boolean {
      return [...root.querySelectorAll('button')].some((button) => button.textContent?.includes(label));
    }

    it('lists the cut-ins and asks for one to be picked until one is', async () => {
      const root = await drawn();

      expect(options(root).map((option) => option.querySelector('span')?.textContent?.trim())).toEqual(
        expect.arrayContaining(['登場', '決めゼリフ'])
      );
      expect(options(root)).toHaveLength(2);
      expect(root.textContent).toContain(t('feature.media.cutIn.selectFromList'));
      expect(root.querySelector('cut-in-editor')).toBeNull();
    });

    it('opens the editor of the cut-in picked, with the buttons to save and delete it', async () => {
      const root = await drawn();

      options(root)
        .find((option) => option.textContent?.includes('決めゼリフ'))!
        .click();
      await drawn();

      expect(component.selectedCutIn()?.name).toBe('決めゼリフ');
      expect(root.querySelector('cut-in-editor')).not.toBeNull();
      expect(root.textContent).not.toContain(t('feature.media.cutIn.selectFromList'));
      expect(hasButton(root, t('feature.media.cutIn.save'))).toBe(true);
      expect(hasButton(root, t('feature.media.cutIn.delete'))).toBe(true);
    });

    it('adds a cut-in to the list from its add button', async () => {
      const root = await drawn();

      root.querySelector<HTMLButtonElement>(`button[title="${t('feature.media.cutIn.createNew')}"]`)!.click();
      await drawn();

      expect(options(root)).toHaveLength(3);
    });
  });

  describe('throwing a cut-in away', () => {
    beforeEach(() => {
      PeerCursor.myCursor = { role: PeerRole.Player, identifier: 'seat-cursor' } as PeerCursor;
    });

    afterEach(() => {
      for (const cutIn of component.cutIns()) cutIn.destroy();
      vi.restoreAllMocks();
    });

    function answer(yes: boolean) {
      return vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(yes);
    }

    it('asks first, naming the cut-in, and keeps it on a no', async () => {
      component.createCutIn();
      const made = component.selectedCutIn()!;
      made.name = '決めゼリフ';
      const ask = answer(false);

      await component.delete();

      expect(ask).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('決めゼリフ'), okLabel: '削除', danger: true })
      );
      expect(component.cutIns()).toContain(made);
      expect(component.selectedCutIn()).toBe(made);
    });

    it('throws it away for everyone on a yes', async () => {
      component.createCutIn();
      const made = component.selectedCutIn()!;
      answer(true);

      await component.delete();

      expect(component.cutIns()).not.toContain(made);
      expect(component.selectedCutIn()).toBeNull();
    });

    it('keeps both when another cut-in was picked while the question was open', async () => {
      component.createCutIn();
      const first = component.selectedCutIn()!;
      component.createCutIn();
      const second = component.selectedCutIn()!;
      component.selectedCutIn.set(first);
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockImplementation(async () => {
        component.selectedCutIn.set(second);
        return true;
      });

      await component.delete();

      expect(component.cutIns()).toEqual(expect.arrayContaining([first, second]));
    });
  });

  describe('how many ways a cut-in faces', () => {
    it('writes the choice to this screen, which is the one the cut-in is watched on', () => {
      component.multiDirectionMode = 'four-directions';

      expect(component.multiDirectionMode).toBe('four-directions');
      expect(TestBed.inject(TabletopDisplayPreferenceService).own().cutInMultiDirectionMode).toBe('four-directions');
      expect(table.cutInMultiDirectionMode).toBe('none');
    });

    it('shows what the table asks for until this screen is told otherwise', () => {
      table.cutInMultiDirectionMode = 'vertical';

      expect(component.multiDirectionMode).toBe('vertical');
    });

    it('reads a mode it does not know as facing one way', () => {
      component.multiDirectionMode = 'sideways' as never;

      expect(component.multiDirectionMode).toBe('none');
    });
  });
});
