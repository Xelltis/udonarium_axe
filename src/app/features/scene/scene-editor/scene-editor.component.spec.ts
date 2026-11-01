import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { emitSelectGameTable } from '@axe/core/event/domain-events';
import { CutIn } from '@axe/domain/media/cut-in';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BoardScene } from '@axe/domain/scene/board-scene';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { SceneEditorComponent } from '@axe/features/scene/scene-editor/scene-editor.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SceneEditorComponent', () => {
  let fixture: ComponentFixture<SceneEditorComponent>;
  let scene: BoardScene;
  let village: GameTable;

  function open(canEdit = true): HTMLElement {
    fixture = TestBed.createComponent(SceneEditorComponent);
    fixture.componentRef.setInput('scene', scene);
    fixture.componentRef.setInput('canEdit', canEdit);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  async function redraw(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function tick(root: HTMLElement, part: string, on = true): void {
    const box = root.querySelector<HTMLInputElement>(`[data-testid="scene-part-toggle-${part}"]`)!;
    box.checked = on;
    box.dispatchEvent(new Event('change'));
  }

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ imports: [SceneEditorComponent], providers: [...TEST_PROVIDERS] });
    village = new GameTable();
    village.name = '村';
    village.imageIdentifier = 'day';
    village.initialize();
    expect(TableSelecter.instance).toBeTruthy();
    emitSelectGameTable({ identifier: village.identifier });
    new Jukebox('Jukebox').initialize();
    scene = new BoardScene();
    scene.initialize();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it('fills a part ticked from the board as it stands, and empties it again unticked', async () => {
    const root = open();

    tick(root, 'floor');
    tick(root, 'darkness');
    await redraw();
    expect(scene.floorImageIdentifier).toBe('day');
    expect(scene.darkness).toBe('off');
    expect(root.querySelector('[data-testid="scene-picture-floorImageIdentifier"]')).not.toBeNull();

    tick(root, 'floor', false);
    await redraw();
    expect(scene.floorImageIdentifier).toBe('');
    expect(root.querySelector('[data-testid="scene-picture-floorImageIdentifier"]')).toBeNull();
  });

  it('starts the music and background sounds as silence while the room plays none', () => {
    const root = open();

    tick(root, 'bgm');
    tick(root, 'bgs');

    expect([scene.bgm, scene.bgs]).toEqual(['stop', 'stop']);
  });

  it('shows the table chosen, by identifier and name', async () => {
    const cave = new GameTable();
    cave.name = '洞窟';
    cave.initialize();
    const root = open();
    tick(root, 'table');
    await redraw();

    const select = root.querySelector<HTMLSelectElement>('[data-testid="scene-table"]')!;
    select.selectedIndex = Array.from(select.options).findIndex((option) => option.textContent?.trim() === '洞窟');
    select.dispatchEvent(new Event('change'));

    expect([scene.tableIdentifier, scene.tableName]).toEqual([cave.identifier, '洞窟']);
  });

  it('takes a picture away where the empty picture is chosen', async () => {
    scene.floorImageIdentifier = 'night';
    vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue('null');
    const root = open();

    root.querySelector<HTMLButtonElement>('[data-testid="scene-picture-floorImageIdentifier"]')!.click();
    await redraw();

    expect(scene.floorImageIdentifier).toBe('none');
  });

  it('warns that a cut-in with music of its own cuts the scene’s music off', async () => {
    const loud = new CutIn();
    loud.audioIdentifier = 'fanfare';
    loud.initialize();
    scene.bgm = 'stop';
    scene.cutInIdentifiers = loud.identifier;

    const root = open();
    await redraw();

    expect(root.querySelector('[data-testid="scene-cut-in-music"]')).not.toBeNull();
  });

  it('changes nothing for a reader who may not change scenes', () => {
    const root = open(false);

    tick(root, 'floor');

    expect(scene.floorImageIdentifier).toBe('');
    expect(root.querySelector<HTMLInputElement>('[data-testid="scene-name"]')!.disabled).toBe(true);
  });
});
