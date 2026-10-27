import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { StatusAilmentPanelComponent } from '@axe/features/status-ailment/status-ailment-panel/status-ailment-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('StatusAilmentPanelComponent', () => {
  let fixture: ComponentFixture<StatusAilmentPanelComponent>;
  let component: StatusAilmentPanelComponent;
  let service: StatusAilmentService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [StatusAilmentPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    service = TestBed.inject(StatusAilmentService);
    service.save([]);
    fixture = TestBed.createComponent(StatusAilmentPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
    service.save([]);
    (StatusAilmentCatalog as unknown as Record<string, unknown>)['_instance'] = undefined;
  });

  it('takes a state and shows it', () => {
    component.newName.set('毒');
    component.add();
    fixture.detectChanges();

    expect(service.ailments().map((entry) => entry.name)).toEqual(['毒']);
    expect(fixture.nativeElement.textContent).toContain('毒');
  });

  it('clears the box once the state is on the list', () => {
    component.newName.set('毒');
    component.add();

    expect(component.newName()).toBe('');
  });

  it('keeps the box filled when the name is already taken', () => {
    service.add('毒');
    component.newName.set('毒');

    component.add();

    expect(component.newName()).toBe('毒');
    expect(service.ailments()).toHaveLength(1);
  });

  it('dresses a state the way it is set', () => {
    service.add('毒');

    component.setColor(service.ailments()[0], 'green');
    component.setIcon(service.ailments()[0], '☠');
    component.setEffect(service.ailments()[0], '毎ラウンド HP-1');

    expect(service.ailments()[0]).toMatchObject({ color: 'green', icon: '☠', effect: '毎ラウンド HP-1' });
  });

  it('starts a held state counting down once it is given rounds', () => {
    service.add('加護');

    component.setRounds(service.ailments()[0], '3');

    expect(service.ailments()[0]).toMatchObject({ rounds: 3, timing: 'roundEnd' });
  });

  it('leaves a moment it does not know alone', () => {
    service.add('毒');

    component.setTiming(service.ailments()[0], 'いつか');

    expect(service.ailments()[0].timing).toBe('none');
  });

  it('moves one along the order and takes one away', () => {
    service.add('毒');
    service.add('麻痺');

    component.move('麻痺', -1);
    expect(service.ailments().map((entry) => entry.name)).toEqual(['麻痺', '毒']);

    component.remove('麻痺');
    expect(service.ailments().map((entry) => entry.name)).toEqual(['毒']);
  });

  describe('the mark it wears', () => {
    afterEach(() => vi.restoreAllMocks());

    it('takes a picture in place of the mark', async () => {
      service.add('毒');
      vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue('image-1');

      component.chooseIconImage(service.ailments()[0]);
      await Promise.resolve();

      expect(service.ailments()[0].icon).toBe('image-1');
    });

    it('draws the picture where the mark would go', () => {
      vi.spyOn(ImageStorage.instance, 'get').mockImplementation((identifier: string) =>
        identifier === 'image-1' ? ({ identifier, url: 'blob:poison' } as ImageFile) : null
      );
      service.save([{ ...newStatusAilment('毒'), icon: 'image-1' }]);
      fixture.detectChanges();

      expect(component.iconUrlOf(service.ailments()[0])).toBe('blob:poison');
      expect(fixture.nativeElement.querySelector('img')).toBeTruthy();
    });

    it('leaves an emoji as it is', () => {
      vi.spyOn(ImageStorage.instance, 'get').mockReturnValue(null);
      service.save([{ ...newStatusAilment('毒'), icon: '☠️' }]);
      fixture.detectChanges();

      expect(component.iconUrlOf(service.ailments()[0])).toBe('');
      expect(fixture.nativeElement.textContent).toContain('☠️');
    });
  });

  it('lets nobody who cannot edit the table change the list', () => {
    service.add('毒');
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);
    fixture.detectChanges();

    component.newName.set('麻痺');
    component.add();
    component.remove('毒');
    component.setColor(service.ailments()[0], 'red');

    expect(service.ailments().map((entry) => entry.name)).toEqual(['毒']);
    expect(service.ailments()[0].color).toBe('');
  });
});
