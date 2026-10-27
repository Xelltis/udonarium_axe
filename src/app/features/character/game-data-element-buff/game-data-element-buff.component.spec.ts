import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
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
