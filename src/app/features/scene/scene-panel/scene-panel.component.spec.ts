import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BoardSceneService } from '@axe/application/tabletop/board-scene.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { emitSelectGameTable } from '@axe/core/event/domain-events';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BoardScene } from '@axe/domain/scene/board-scene';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { ScenePanelComponent } from '@axe/features/scene/scene-panel/scene-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ScenePanelComponent', () => {
  let fixture: ComponentFixture<ScenePanelComponent>;
  let village: GameTable;

  function open(role: PeerRole): HTMLElement {
    PeerCursor.myCursor.role = role;
    fixture = TestBed.createComponent(ScenePanelComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** Draws again once the changes made here have been told, which they are on the next microtask. */
  async function redraw(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const rows = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLElement>('[data-testid="scene-row"]')).map(
      (row) => row.getAttribute('data-scene-name') ?? ''
    );

  beforeEach(() => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({ imports: [ScenePanelComponent], providers: [...TEST_PROVIDERS] });
    village = new GameTable();
    village.name = '村';
    village.imageIdentifier = 'day';
    village.initialize();
    expect(TableSelecter.instance).toBeTruthy();
    emitSelectGameTable({ identifier: village.identifier });
  });

  afterEach(() => {
    fixture?.destroy();
    Config.instance.boardScene = '';
    Config.instance.boardSceneFolders = [];
    vi.restoreAllMocks();
  });

  it('tells a player that scenes are the game master’s, and shows them none', () => {
    const scene = new BoardScene();
    scene.name = 'ボス戦';
    scene.initialize();

    const root = open(PeerRole.Player);

    expect(root.textContent).toContain('シーンはGMだけが使えます');
    expect(rows(root)).toEqual([]);
  });

  it('makes a scene from the board as it stands and opens it for putting together', async () => {
    const root = open(PeerRole.GameMaster);
    expect(root.querySelector('[data-testid="scene-empty"]')).not.toBeNull();

    root.querySelector<HTMLButtonElement>('[data-testid="scene-create"]')!.click();
    await redraw();

    expect(rows(root)).toEqual(['シーン1']);
    expect(BoardScene.all()[0].floorImageIdentifier).toBe('day');
    expect(root.querySelector('[data-testid="scene-editor"]')).not.toBeNull();
  });

  it('puts a scene on from the button on its row, and marks it as the scene the room is in', async () => {
    const scene = new BoardScene();
    scene.name = '夜の村';
    scene.floorImageIdentifier = 'night';
    scene.initialize();
    const root = open(PeerRole.GameMaster);

    root.querySelector<HTMLButtonElement>('[data-testid="scene-row-apply"]')!.click();
    await redraw();

    expect(village.imageIdentifier).toBe('night');
    expect(root.querySelector('[data-testid="scene-current"]')).not.toBeNull();
  });

  it('lays the scenes out in their folders, with the folders kept empty', () => {
    const night = new BoardScene();
    night.name = '夜';
    night.folderName = '村';
    night.order = 2;
    night.initialize();
    const loose = new BoardScene();
    loose.name = '序章';
    loose.order = 1;
    loose.initialize();
    Config.instance.boardSceneFolders = ['洞窟'];

    const root = open(PeerRole.GameMaster);

    const headings = Array.from(root.querySelectorAll('[data-testid="folder-heading"]')).map((heading) =>
      heading.getAttribute('data-folder-path')
    );
    expect(headings).toEqual(['村', '洞窟']);
    expect(rows(root)).toEqual(['夜', '序章']);
  });

  it('makes a folder from the button beside the one making a scene, its name open to type', async () => {
    const root = open(PeerRole.GameMaster);

    root.querySelector<HTMLButtonElement>('[data-testid="scene-create-folder"]')!.click();
    await redraw();

    expect(Config.instance.boardSceneFolders).toEqual(['フォルダ1']);
    expect(root.querySelector('[data-testid="folder-name-input"]')).not.toBeNull();
  });

  it('writes the board over a scene only once the game master says so', async () => {
    const scene = new BoardScene();
    scene.floorImageIdentifier = 'night';
    scene.initialize();
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
    const overwrite = vi.spyOn(TestBed.inject(BoardSceneService), 'overwrite');
    open(PeerRole.GameMaster);

    await (fixture.componentInstance as unknown as { overwrite: (s: BoardScene) => Promise<void> }).overwrite(scene);
    expect(overwrite).not.toHaveBeenCalled();

    ask.mockResolvedValue(true);
    await (fixture.componentInstance as unknown as { overwrite: (s: BoardScene) => Promise<void> }).overwrite(scene);
    expect(overwrite).toHaveBeenCalledWith(scene);
  });
});
