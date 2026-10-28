import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
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

    expect(root.querySelector('[data-testid="buff-row-icon-picture"]')?.getAttribute('src')).toBe('blob:poison');
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

    expect(root.querySelector('[data-testid="buff-row-icon-picture"]')).toBeNull();
    expect(root.textContent).toContain('☠️');
    row.destroy();
  });

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
});
