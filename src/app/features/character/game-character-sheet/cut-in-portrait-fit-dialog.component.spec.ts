import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { portraitFitFor, readPortraitFits, withPortraitFits } from '@axe/domain/media/cut-in-portrait-fit';
import {
  CutInPortraitFitDialogComponent,
  portraitFitFrameWidth,
} from '@axe/features/character/game-character-sheet/cut-in-portrait-fit-dialog.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CutInPortraitFitDialogComponent', () => {
  let fixture: ComponentFixture<CutInPortraitFitDialogComponent>;
  let component: CutInPortraitFitDialogComponent;
  let modalService: { option: unknown; title: string; resolve: ReturnType<typeof vi.fn> };
  let hero: GameCharacter;
  let canEdit: boolean;

  beforeEach(async () => {
    canEdit = true;
    for (const identifier of ['pic-a', 'pic-b']) {
      ImageStorage.instance.add({
        identifier,
        name: `${identifier}.png`,
        type: 'image/png',
        blob: null,
        url: `blob:${identifier}`,
        thumbnail: { type: '', blob: null, url: '' },
      });
    }
    hero = GameCharacter.create('ヒロ', 1, 'pic-a');
    hero.imageDataElement?.appendChild(DataElement.create('imageIdentifier', 'pic-b', { type: 'image' }, ''));

    modalService = {
      option: { characterIdentifier: hero.identifier, pictureIdentifier: 'pic-a' },
      title: '',
      resolve: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [CutInPortraitFitDialogComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    TestBed.overrideProvider(ModalService, { useValue: modalService });
    TestBed.overrideProvider(RolePermissionService, {
      useValue: {
        get canEditTabletop() {
          return canEdit;
        },
      },
    });
    fixture = TestBed.createComponent(CutInPortraitFitDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    hero.destroy();
    ImageStorage.instance.delete('pic-a');
    ImageStorage.instance.delete('pic-b');
  });

  function stage(): HTMLElement {
    return fixture.nativeElement.querySelector('[data-testid="cut-in-fit-stage"]') as HTMLElement;
  }

  function pointer(type: string, pointerId: number, clientX: number, clientY: number): void {
    stage().dispatchEvent(new PointerEvent(type, { pointerId, clientX, clientY, bubbles: true }));
    fixture.detectChanges();
  }

  function state(): string | null {
    return (
      (fixture.nativeElement.querySelector('[data-testid="cut-in-fit-state"]') as HTMLElement).dataset['state'] ?? null
    );
  }

  it('starts on the portrait it was opened on, shown whole and left to each cut-in', () => {
    const picture = fixture.nativeElement.querySelector('[data-testid="cut-in-fit-stage"] img') as HTMLImageElement;
    expect(picture.getAttribute('src')).toBe('blob:pic-a');
    expect(picture.style.transform).toBe('translate(0%, 0%) scale(1)');
    expect(state()).toBe('unset');
    expect(fixture.nativeElement.querySelectorAll('[role="radio"]').length).toBe(2);
  });

  it('writes nothing while the portrait is dragged, and all of it once on closing', () => {
    const width = portraitFitFrameWidth(window.innerWidth);
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 100 + width * 0.1, 100);
    pointer('pointermove', 1, 100 + width * 0.2, 100);
    pointer('pointerup', 1, 100 + width * 0.2, 100);

    expect(hero.cutInPortraitFits).toBe('');
    expect(component.fit().x).toBeCloseTo(0.2, 3);
    expect(state()).toBe('set');

    component.apply();

    expect(portraitFitFor(hero.cutInPortraitFits, 'pic-a')?.x).toBeCloseTo(0.2, 3);
    expect(modalService.resolve).toHaveBeenCalledWith(true);
  });

  it('grows the portrait with the wheel and the keys', () => {
    stage().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 0, clientY: 0, cancelable: true }));
    expect(component.fit().scale).toBeCloseTo(1.1, 3);

    stage().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, cancelable: true }));
    expect(component.fit().y - 0).toBeGreaterThan(0.04);
  });

  it('pinches the portrait larger with two fingers drawn apart', () => {
    pointer('pointerdown', 1, 100, 100);
    pointer('pointerdown', 2, 200, 100);
    pointer('pointermove', 2, 300, 100);

    expect(component.fit().scale).toBeCloseTo(2, 3);
  });

  it('keeps what was changed on one portrait while another is fitted', () => {
    stage().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    component.choose('pic-b');
    fixture.detectChanges();
    stage().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));

    component.apply();

    expect(portraitFitFor(hero.cutInPortraitFits, 'pic-a')?.x).toBeCloseTo(0.01, 4);
    expect(portraitFitFor(hero.cutInPortraitFits, 'pic-b')?.x).toBeCloseTo(-0.01, 4);
  });

  it('puts a portrait back to each cut-in’s own framing, and drops fits of portraits the character no longer has', () => {
    hero.cutInPortraitFits = withPortraitFits(
      '',
      new Map([
        ['pic-a', { scale: 2, x: 0, y: 0 }],
        ['gone', { scale: 2, x: 0, y: 0 }],
      ]),
      ['pic-a', 'gone']
    );
    TestBed.inject(ObjectChangeService).notifyChanged(hero.identifier);
    fixture.detectChanges();
    expect(component.fit().scale).toBe(2);

    (fixture.nativeElement.querySelector('[data-testid="cut-in-fit-put-back"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(state()).toBe('unset');
    component.apply();

    expect(readPortraitFits(hero.cutInPortraitFits).size).toBe(0);
    expect(hero.cutInPortraitFits).toBe('');
  });

  it('writes nothing for a reader who may not change the table', () => {
    canEdit = false;
    stage().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));

    component.apply();

    expect(hero.cutInPortraitFits).toBe('');
  });
});
