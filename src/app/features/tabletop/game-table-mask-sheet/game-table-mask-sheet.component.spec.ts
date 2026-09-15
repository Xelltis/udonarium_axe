import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { GameTableMaskSheetComponent } from '@axe/features/tabletop/game-table-mask-sheet/game-table-mask-sheet.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

interface DeletedChannel {
  _objectDeleted$: { emit(event: { aliasName: string; identifier: string; isSendFromSelf: boolean }): void };
}

describe('GameTableMaskSheetComponent', () => {
  let fixture: ComponentFixture<GameTableMaskSheetComponent>;
  let component: GameTableMaskSheetComponent;
  let mask: GameTableMask;
  let close: ReturnType<typeof vi.fn>;
  let picked: string | null;

  function field(name: string): HTMLInputElement {
    return fixture.nativeElement.querySelector(`[data-field="${name}"]`);
  }

  function action(name: string): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(`[data-action="${name}"]`);
  }

  function pickColor(name: string, color: string): void {
    const input = field(name);
    input.value = color;
    input.dispatchEvent(new Event('change'));
  }

  /**
   * Waits for a change to reach the view: a change to the mask is announced on a microtask, and the
   * translations the template asks for arrive after the first render, so a single `whenStable` can
   * come back before either has drawn anything.
   */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    close = vi.fn();
    picked = null;
    await TestBed.configureTestingModule({
      imports: [GameTableMaskSheetComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    TestBed.overrideProvider(PanelService, { useValue: { close } });
    TestBed.overrideProvider(ModalService, { useValue: { open: () => Promise.resolve(picked) } });

    mask = GameTableMask.create('mask', 3, 2, 100);
    fixture = TestBed.createComponent(GameTableMaskSheetComponent);
    component = fixture.componentInstance;
    component.gameTableMask = mask;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    mask.destroy();
    ImageStorage.instance.images.forEach((image) => ImageStorage.instance.delete(image.identifier));
  });

  describe('the basic settings', () => {
    it('shows the name, size and opacity of the mask', () => {
      expect(field('name').value).toBe('mask');
      expect(field('width').value).toBe('3');
      expect(field('height').value).toBe('2');
      expect(field('opacity').value).toBe('100');
    });

    it('follows a change another peer makes to the mask', async () => {
      mask.name = 'renamed';
      mask.width = 5;
      await settle();

      expect(field('name').value).toBe('renamed');
      expect(field('width').value).toBe('5');
    });

    it('writes the name to the mask', () => {
      component.name = 'fog';
      expect(mask.name).toBe('fog');
    });

    it('writes the size as whole cells of at least one, and ignores an empty field', () => {
      component.width = 4.7;
      component.height = 0;
      expect(mask.width).toBe(4);
      expect(mask.height).toBe(1);

      component.width = null as unknown as number;
      component.height = '' as unknown as number;
      expect(mask.width).toBe(4);
      expect(mask.height).toBe(1);
    });

    it('writes the opacity as the current value of its element, kept between 0 and 100', () => {
      const element = mask.commonDataElement!.getFirstElementByName('opacity')!;

      component.opacity = 40;
      expect(element.currentValue).toBe(40);
      expect(component.opacity).toBe(40);

      component.opacity = 150;
      expect(mask.opacity).toBe(1);
    });

    it('counts the opacity out of whatever maximum the element keeps', () => {
      const element = mask.commonDataElement!.getFirstElementByName('opacity')!;
      element.value = 200;

      component.opacity = 50;

      expect(element.currentValue).toBe(100);
      expect(component.opacity).toBe(50);
    });
  });

  describe('the mask itself', () => {
    it('starts from the default fill on a mask with no colour element, and adds one on the first pick', () => {
      expect(mask.commonDataElement!.getFirstElementByName('color')).toBeNull();
      expect(field('mask-color').value).toBe('#0a0a0a');

      pickColor('mask-color', '#336699');

      const element = mask.commonDataElement!.getFirstElementByName('color');
      expect(element).not.toBeNull();
      expect(element!.value).toBe('#336699');
      expect(element!.currentValue).toBe('#336699');
      expect(mask.bgcolor).toBe('#336699');
    });

    it('sets its picture from the picker, and leaves it when nothing is picked', async () => {
      const element = mask.imageDataElement!.getFirstElementByName('imageIdentifier')!;
      picked = 'image-1';
      action('set-mask-image')!.click();
      await settle();
      expect(element.value).toBe('image-1');

      picked = null;
      component.openMaskImageModal();
      await settle();
      expect(element.value).toBe('image-1');
    });

    it('takes its picture off from the clear button', async () => {
      const element = mask.imageDataElement!.getFirstElementByName('imageIdentifier')!;
      expect(action('clear-mask-image')).toBeNull();
      element.value = 'image-1';
      await settle();

      action('clear-mask-image')!.click();

      expect(element.value).toBe('');
    });
  });

  describe('the look after scratching', () => {
    it('shows none on a mask that has never had it', () => {
      expect(component.scratchedColor).toBe('');
      expect(component.scratchedImage().isSet).toBe(false);
      expect(action('clear-scratched-color')).toBeNull();
      expect(action('clear-scratched-image')).toBeNull();
    });

    it('shows the stored colour in its picker, and a mid grey while there is none', async () => {
      expect(field('scratched-color').value).toBe('#808080');

      mask.scratchedColor = '#112233';
      await settle();

      expect(field('scratched-color').value).toBe('#112233');
    });

    it('adds the colour element on the first pick, and empties it from the none button', async () => {
      pickColor('scratched-color', '#112233');
      expect(mask.commonDataElement!.getFirstElementByName('scratchedColor')).not.toBeNull();
      expect(mask.scratchedColor).toBe('#112233');
      await settle();

      action('clear-scratched-color')!.click();

      expect(mask.scratchedColor).toBe('');
    });

    it('sets the picture from the picker, and takes it off from the clear button', async () => {
      picked = 'image-2';
      action('set-scratched-image')!.click();
      await settle();
      expect(mask.scratchedImageIdentifier).toBe('image-2');
      expect(mask.imageDataElement!.getFirstElementByName('imageIdentifier')!.value).toBe('');

      action('clear-scratched-image')!.click();

      expect(mask.scratchedImageIdentifier).toBe('');
    });
  });

  describe('the data sheet', () => {
    it('opens the generic sheet of the mask from its button, for the data the panel does not show', () => {
      const openSheet = vi.spyOn(TestBed.inject(ObjectPanelService), 'openSheet').mockImplementation(() => undefined);

      action('open-data-sheet')!.click();

      expect(openSheet).toHaveBeenCalledTimes(1);
      expect(openSheet.mock.calls[0][0]).toBe(mask);
    });
  });

  describe('closing', () => {
    function announceDeleted(identifier: string): void {
      const channel = TestBed.inject(ObjectChangeService) as unknown as DeletedChannel;
      channel._objectDeleted$.emit({ aliasName: GameTableMask.aliasName, identifier, isSendFromSelf: true });
    }

    it('closes when its mask is deleted', () => {
      announceDeleted(mask.identifier);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('stays open when some other object is deleted', () => {
      announceDeleted('someone-else');
      expect(close).not.toHaveBeenCalled();
    });
  });
});
