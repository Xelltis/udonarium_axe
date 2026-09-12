import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { DataElement } from '@axe/domain/data/data-element';
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';
import { GameTableScratchMaskComponent } from '@axe/features/tabletop/game-table-scratch-mask/game-table-scratch-mask.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameTableScratchMaskComponent', () => {
  let component: GameTableScratchMaskComponent;
  let fixture: ComponentFixture<GameTableScratchMaskComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameTableScratchMaskComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GameTableScratchMaskComponent);
    component = fixture.componentInstance;
  });

  it('should be defined', () => {
    expect(component).toBeTruthy();
  });

  it('follows a mask being resized or recoloured, without it being moved', async () => {
    // Nothing else is drawn on a scratch mask, so its box and its colour are the whole of what
    // the table sees. Nothing is checked by hand: they have to follow because the signals said
    // so. The width lives in a data element, which is the way the table writes it.
    const mask = GameTableScratchMask.create('テストマスク', 4, 3, 0.6);
    fixture.componentRef.setInput('gameTableScratchMask', mask);
    fixture.detectChanges();
    const box = () => {
      const element = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[style*="width"]');
      return `${element?.style.width}/${element?.style.height}`;
    };
    const colour = () => {
      const element = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[style*="background-color"]');
      return element?.style.backgroundColor ?? '';
    };
    expect(box()).toBe('200px/150px');

    const widthElement = mask.commonDataElement?.getFirstElementByName('width') as DataElement | null;
    if (widthElement) widthElement.value = 9;
    mask.color = 'rgb(1, 2, 3)';
    TestBed.inject(ObjectChangeService).notifyChanged(mask.identifier);
    await fixture.whenStable();

    expect(box()).toBe('450px/150px');
    expect(colour()).toBe('rgb(1, 2, 3)');
    mask.destroy();
  });

  it('reads without throwing when there is no mask', () => {
    fixture.componentRef.setInput('gameTableScratchMask', null);
    expect(() => {
      const _name = component.name();
      const _width = component.width();
      const _height = component.height();
      const _isLock = component.isLock();
      const _color = component.color();
      const _isMine = component.isMine;
      const _posX = component.posX();
      const _posY = component.posY();
      const _posZ = component.posZ();
    }).not.toThrow();
  });
});
