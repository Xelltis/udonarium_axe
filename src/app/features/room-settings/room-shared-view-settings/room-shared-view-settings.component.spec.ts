import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { RoomSharedViewSettingsComponent } from '@axe/features/room-settings/room-shared-view-settings/room-shared-view-settings.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomSharedViewSettingsComponent', () => {
  let fixture: ComponentFixture<RoomSharedViewSettingsComponent>;
  let component: RoomSharedViewSettingsComponent;
  let table: GameTable;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomSharedViewSettingsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = 50;
    table.initialize();
    fixture = TestBed.createComponent(RoomSharedViewSettingsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  async function drawn(): Promise<HTMLElement> {
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  describe('how a piece shows which way it faces', () => {
    it('shows what the table asks for while the room has been asked nothing', () => {
      table.facingMark = 'arrow';

      expect(Config.instance.roomRuleAnswers.facingMark).toBeNull();
      expect(component.facingMark.value).toBe('arrow');
    });

    it('takes the choice over from the table', () => {
      table.facingMark = 'arrow';

      component.facingMark.value = 'turn';

      expect(component.facingMark.value).toBe('turn');
      expect(Config.instance.facingMark).toBe('turn');
      expect(table.facingMark).toBe('arrow');
    });

    it('reads something it does not know as showing nothing', () => {
      table.facingMark = 'compass' as never;

      expect(component.facingMark.value).toBe('none');
    });
  });

  it('leaves what the room shows everyone to the master', () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    TableSelecter.instance.viewTableIdentifier = table.identifier;

    component.facingMark.value = 'arrow';
    component.imageBillboard.value = true;

    expect(component.isSharedReadOnly()).toBe(true);
    expect(component.facingMark.value).not.toBe('arrow');
    expect(table.imageBillboard).toBe(false);
  });

  it('keeps the shared settings out of a reader who may not edit the room', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;
    TableSelecter.instance.viewTableIdentifier = table.identifier;

    component.imageBillboard.value = true;

    expect(table.imageBillboard).toBe(false);
  });

  it('turns the pieces of the table in view to face the reader, for the master', () => {
    TableSelecter.instance.viewTableIdentifier = table.identifier;

    component.imageBillboard.value = true;

    expect(table.imageBillboard).toBe(true);
    expect(component.imageBillboard.value).toBe(true);
  });

  it('keeps a piece inside its cell for the whole room', async () => {
    const block = (await drawn()).querySelector('[data-testid="room-settings-flat-pieces"]');

    expect(block).toBeTruthy();
    expect(block!.querySelector('[data-testid="piece-image-in-cell"]')).toBeTruthy();

    component.pieceImageInCell.value = true;

    expect(component.pieceImageInCell.value).toBe(true);
    expect(Config.instance.pieceImageInCell).toBe(true);
  });

  it('leaves a piece in its cell to the master', () => {
    PeerCursor.myCursor.role = PeerRole.Player;

    component.pieceImageInCell.value = true;

    expect(component.pieceImageInCell.value).toBe(false);
    expect(Config.instance.pieceImageInCell).toBeNull();
  });

  it('gives every number resource a slider for the whole room', async () => {
    const box = (await drawn()).querySelector('[data-testid="resource-slider-default"]') as HTMLInputElement;
    expect(box).toBeTruthy();
    expect(box.checked).toBe(false);

    box.click();
    await drawn();

    expect(component.resourceSliderByDefault.value).toBe(true);
    expect(Config.instance.resourceSliderByDefault).toBe(true);
    Config.instance.resourceSliderByDefault = false;
  });

  it('leaves the sliders of the room to the master', () => {
    PeerCursor.myCursor.role = PeerRole.Player;

    component.resourceSliderByDefault.value = true;

    expect(Config.instance.resourceSliderByDefault).toBe(false);
  });
});
